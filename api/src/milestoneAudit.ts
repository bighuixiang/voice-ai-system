import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readMilestoneRepairPlan } from "./milestoneRepairPlan.js";
import { readMilestoneRepairCompletion } from "./milestoneRepairCompletion.js";
import { evaluateMilestoneRepairEvidence, verifyMilestoneRepairDomainArtifact } from "./milestoneRepairPolicy.js";

export interface MilestoneAuditIssue { code: "REPAIR_ACTION_COMPLETION_REQUIRED" | "REPAIR_ACTION_EVIDENCE_MISMATCH" | "MILESTONE_DOMAIN_EVIDENCE_REQUIRED" | "MILESTONE_OBLIGATION_CERTIFICATE_STALE" | "MILESTONE_CHARACTER_ARC_ARTIFACT_STALE" | "MILESTONE_PROJECTION_ARTIFACT_STALE" | "MILESTONE_MEMORY_ARTIFACT_STALE" | "MILESTONE_WORLD_ARTIFACT_STALE" | "MILESTONE_CONTINUITY_ARTIFACT_STALE" | "MILESTONE_PACING_ARTIFACT_STALE"; actionId: string; }
export interface MilestoneAudit {
  schemaVersion: "milestone-audit.v1";
  auditId: string;
  planId: string;
  projectSlug: string;
  bookRunId: string;
  runVersion: number;
  sourceFingerprint: string;
  actionIds: string[];
  status: "passed" | "blocked";
  issues: MilestoneAuditIssue[];
  evidenceRefs: string[];
  evaluatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function auditPath(root: string, auditId: string): string { return resolveInside(root, `sessions/milestone-audits/${auditId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

function assertIntegrity(audit: MilestoneAudit, auditId: string): MilestoneAudit {
  const { fingerprint: _fingerprint, ...base } = audit;
  if (audit.schemaVersion !== "milestone-audit.v1" || audit.auditId !== auditId || !audit.planId.trim() || !audit.projectSlug.trim() || !audit.bookRunId.trim() || !Number.isInteger(audit.runVersion) || audit.runVersion < 1 || !audit.sourceFingerprint.trim() || !Array.isArray(audit.actionIds) || !audit.actionIds.length || !["passed", "blocked"].includes(audit.status) || !Array.isArray(audit.issues) || !Array.isArray(audit.evidenceRefs) || !/^[a-f0-9]{64}$/i.test(audit.fingerprint) || hash(base) !== audit.fingerprint) throw new Error("MILESTONE_AUDIT_INTEGRITY_FAILED");
  return audit;
}

export async function readMilestoneAudit(root: string, auditId: string): Promise<MilestoneAudit | null> {
  try { return assertIntegrity(JSON.parse(await fs.readFile(auditPath(root, auditId), "utf8")) as MilestoneAudit, auditId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function auditMilestoneRepair(input: { root: string; planId: string; sourceFingerprint: string; persist?: boolean }): Promise<MilestoneAudit> {
  const plan = await readMilestoneRepairPlan(input.root, input.planId);
  if (!plan) throw new Error("MILESTONE_REPAIR_PLAN_NOT_FOUND");
  if (input.sourceFingerprint.trim() !== plan.sourceFingerprint) throw new Error("MILESTONE_AUDIT_SOURCE_MISMATCH");
  const actionIds = plan.actions.map((action) => action.actionId);
  const issues: MilestoneAuditIssue[] = [];
  const evidenceRefs: string[] = [];
  const state: Array<{ actionId: string; status: string; evidenceRefs: string[] }> = [];
  for (const action of plan.actions) {
    const receipt = await readMilestoneRepairCompletion(input.root, `repair-completion-${plan.planId}-${action.actionId}`).catch(() => null);
    if (!receipt || receipt.projectSlug !== plan.projectSlug || receipt.bookRunId !== plan.bookRunId || receipt.runVersion !== plan.runVersion || receipt.workItemId !== `book-repair-${action.actionId}`) {
      issues.push({ code: "REPAIR_ACTION_COMPLETION_REQUIRED", actionId: action.actionId });
      state.push({ actionId: action.actionId, status: "missing", evidenceRefs: [] });
      continue;
    }
    const expected = new Set(action.evidenceRefs);
    if (!receipt.evidenceRefs.some((ref) => expected.has(ref) || ref.startsWith("repair://"))) issues.push({ code: "REPAIR_ACTION_EVIDENCE_MISMATCH", actionId: action.actionId });
    const policy = evaluateMilestoneRepairEvidence({ kind: action.kind, evidenceRefs: receipt.evidenceRefs });
    if (policy.status !== "passed") issues.push({ code: "MILESTONE_DOMAIN_EVIDENCE_REQUIRED", actionId: action.actionId });
    const artifactIssue = await verifyMilestoneRepairDomainArtifact({ root: input.root, kind: action.kind, evidenceRefs: receipt.evidenceRefs, sourceFingerprint: plan.sourceFingerprint, projectSlug: plan.projectSlug });
    if (artifactIssue) issues.push({ code: artifactIssue as MilestoneAuditIssue["code"], actionId: action.actionId });
    evidenceRefs.push(...receipt.evidenceRefs);
    state.push({ actionId: action.actionId, status: policy.status === "passed" ? "completed" : "domain-blocked", evidenceRefs: receipt.evidenceRefs });
  }
  const identity = { planId: plan.planId, sourceFingerprint: plan.sourceFingerprint, state, issues };
  const auditId = `milestone-audit-${hash(identity).slice(0, 24)}`;
  const existing = await readMilestoneAudit(input.root, auditId);
  if (existing) return existing;
  const base = { schemaVersion: "milestone-audit.v1" as const, auditId, planId: plan.planId, projectSlug: plan.projectSlug, bookRunId: plan.bookRunId, runVersion: plan.runVersion, sourceFingerprint: plan.sourceFingerprint, actionIds, status: issues.length ? "blocked" as const : "passed" as const, issues, evidenceRefs: [...new Set(evidenceRefs)].sort(), evaluatedAt: new Date().toISOString() };
  const audit: MilestoneAudit = { ...base, fingerprint: hash(base) };
  if (input.persist !== false) await writeJson(auditPath(input.root, auditId), audit);
  return audit;
}

export async function auditMilestoneRepairsForRun(input: { root: string; projectSlug: string; bookRunId: string; sourceFingerprint: string }): Promise<{ audits: MilestoneAudit[]; issues: MilestoneAuditIssue[] }> {
  const directory = resolveInside(input.root, "sessions/milestone-repair-plans");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const audits: MilestoneAudit[] = [];
  const issues: MilestoneAuditIssue[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    const plan = await readMilestoneRepairPlan(input.root, name.slice(0, -5)).catch(() => null);
    if (!plan || plan.projectSlug !== input.projectSlug || plan.bookRunId !== input.bookRunId) continue;
    const candidate = await auditMilestoneRepair({ root: input.root, planId: plan.planId, sourceFingerprint: input.sourceFingerprint, persist: false });
    const persisted = await readMilestoneAudit(input.root, candidate.auditId);
    if (!persisted || persisted.status !== "passed" || persisted.fingerprint !== candidate.fingerprint) issues.push(...(candidate.issues.length ? candidate.issues : [{ code: "REPAIR_ACTION_COMPLETION_REQUIRED" as const, actionId: "audit-not-persisted" }]));
    if (persisted) audits.push(persisted);
  }
  return { audits, issues };
}
