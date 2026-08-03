import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readBookRun, markBookRunAudited, markBookRunRepairRequired } from "./bookRun.js";
import { refreshBookWorkGraph } from "./bookWorkGraph.js";
import { assertClosureCertificateCurrent } from "./closureCertificate.js";
import { readQuiescenceProof } from "./quiescenceProof.js";
import { auditMilestoneRepairsForRun } from "./milestoneAudit.js";
import { recordBookRunInvalidation } from "./bookRunInvalidation.js";
import { recordBookRunImpactSubgraph } from "./bookRunImpact.js";

export interface CompletionAudit {
  schemaVersion: "completion-audit.v1";
  status: "audited_complete";
  bookRunId: string;
  runVersion: number;
  workGraphFingerprint: string;
  closureCertificateFingerprint: string;
  quiescenceProofFingerprint: string;
  milestoneAuditFingerprints: string[];
  sourceFingerprint: string;
  auditedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function auditPath(root: string, auditId: string): string { return resolveInside(root, `sessions/completion/${auditId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

export function assertCompletionAuditIntegrity(audit: CompletionAudit, expectedId?: string): CompletionAudit {
  const { fingerprint, ...base } = audit;
  const valid = audit?.schemaVersion === "completion-audit.v1" && (!expectedId || audit.bookRunId === expectedId || expectedId.startsWith("completion-")) && audit.status === "audited_complete" && typeof audit.bookRunId === "string" && audit.bookRunId.trim() !== "" && Number.isInteger(audit.runVersion) && audit.runVersion > 0 && [audit.workGraphFingerprint, audit.closureCertificateFingerprint, audit.quiescenceProofFingerprint, audit.sourceFingerprint, audit.auditedAt].every((value) => typeof value === "string" && value.trim()) && Array.isArray(audit.milestoneAuditFingerprints) && audit.milestoneAuditFingerprints.every((value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)) && !Number.isNaN(Date.parse(audit.auditedAt)) && /^[a-f0-9]{64}$/i.test(audit.fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("COMPLETION_AUDIT_INTEGRITY_FAILED");
  return audit;
}

export async function readCompletionAudit(root: string, auditId: string): Promise<CompletionAudit | null> {
  try {
    const audit = JSON.parse(await fs.readFile(auditPath(root, auditId), "utf8")) as CompletionAudit;
    return assertCompletionAuditIntegrity(audit, auditId);
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function runBookCompletionAudit(root: string, bookRunId: string, input: { sourceFingerprint: string }): Promise<CompletionAudit> {
  const run = await readBookRun(root, bookRunId);
  if (!run) throw new Error("BOOK_RUN_NOT_FOUND");
  if (run.status === "audited_complete" && run.completionAuditRef) {
    const previous = await readCompletionAudit(root, path.basename(run.completionAuditRef, ".json"));
    const currentGraph = await refreshBookWorkGraph(root);
    const currentClosure = await assertClosureCertificateCurrent(root, input.sourceFingerprint).catch(() => null);
    const currentQuiescence = await readQuiescenceProof(root, bookRunId, run.version - 1);
    const milestoneAudits = await auditMilestoneRepairsForRun({ root, projectSlug: run.projectSlug, bookRunId, sourceFingerprint: input.sourceFingerprint });
    const currentMilestoneAuditFingerprints = milestoneAudits.audits.filter((audit) => audit.status === "passed").map((audit) => audit.fingerprint).sort();
    // markBookRunAudited increments the run version after persisting the audit;
    // the audit therefore belongs to the immediately preceding run version.
    if (previous && currentClosure && currentQuiescence && milestoneAudits.issues.length === 0 && JSON.stringify(previous.milestoneAuditFingerprints) === JSON.stringify(currentMilestoneAuditFingerprints) && previous.sourceFingerprint === input.sourceFingerprint.trim() && previous.runVersion === run.version - 1 && previous.workGraphFingerprint === currentGraph.fingerprint && previous.closureCertificateFingerprint === currentClosure.certificate.fingerprint && previous.quiescenceProofFingerprint === currentQuiescence.fingerprint) return previous;
    const invalidation = await recordBookRunInvalidation({ root, bookRunId, projectSlug: run.projectSlug, priorRunVersion: run.version, reason: "completion-evidence-stale", sourceFingerprint: input.sourceFingerprint, affectedArtifactRefs: ["sessions/completion", "sessions/book-work-graph.json", "sessions/closure", "sessions/quiescence", "sessions/milestone-audits"] });
    await recordBookRunImpactSubgraph({ root, invalidationId: invalidation.invalidationId, bookRunId, projectSlug: run.projectSlug, priorRunVersion: run.version, reason: "completion-evidence-stale", sourceFingerprint: input.sourceFingerprint, workItems: currentGraph.workItems.map((item) => ({ workItemId: item.workItemId, chapterId: item.chapterId })) });
    await markBookRunRepairRequired(root, bookRunId);
    throw new Error("COMPLETION_AUDIT_STALE");
  }
  const graph = await refreshBookWorkGraph(root);
  if (run.status !== "scope_complete") throw new Error("COMPLETION_SCOPE_REQUIRED");
  if (graph.workItems.some((item) => item.status !== "completed")) throw new Error("COMPLETION_WORK_GRAPH_INCOMPLETE");
  const closure = await assertClosureCertificateCurrent(root, input.sourceFingerprint).catch(() => { throw new Error("COMPLETION_CLOSURE_REQUIRED"); });
  const expectedChapterIds = graph.workItems.map((item) => item.chapterId).sort().join("|");
  if (closure.certificate.chapterIds.join("|") !== expectedChapterIds) throw new Error("COMPLETION_CLOSURE_SCOPE_MISMATCH");
  const quiescence = await readQuiescenceProof(root, bookRunId, run.version);
  if (!quiescence) throw new Error("COMPLETION_QUIESCENCE_REQUIRED");
  const milestoneAudits = await auditMilestoneRepairsForRun({ root, projectSlug: run.projectSlug, bookRunId, sourceFingerprint: input.sourceFingerprint });
  if (milestoneAudits.issues.length) throw new Error("COMPLETION_MILESTONE_AUDIT_REQUIRED");
  const identity = { bookRunId, runVersion: run.version, workGraphFingerprint: graph.fingerprint, closureCertificateFingerprint: closure.certificate.fingerprint, quiescenceProofFingerprint: quiescence.fingerprint, milestoneAuditFingerprints: milestoneAudits.audits.map((audit) => audit.fingerprint).sort(), sourceFingerprint: input.sourceFingerprint.trim() };
  const auditId = `completion-${hash(identity).slice(0, 24)}`;
  const existing = await readCompletionAudit(root, auditId);
  if (existing) return existing;
  const base = { schemaVersion: "completion-audit.v1" as const, status: "audited_complete" as const, ...identity, auditedAt: new Date().toISOString() };
  const audit: CompletionAudit = { ...base, fingerprint: hash(base) };
  await writeJson(auditPath(root, auditId), audit);
  await markBookRunAudited(root, bookRunId, `sessions/completion/${auditId}.json`);
  return audit;
}

async function readJson<T>(target: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(target, "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
