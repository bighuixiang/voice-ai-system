import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MemoryHealthReport } from "./memoryHealthReport.js";
import type { MemoryRetrievalPreview } from "./memoryRetrievalPreview.js";
import type { MemoryProjectionFreshness } from "./memoryProjectionGate.js";
import type { LongContinuityAudit } from "./longContinuityAudit.js";
import { resolveInside } from "./pathSafety.js";

export interface MemoryReadyProof {
  schemaVersion: "memory-ready-proof.v1";
  proofId: string;
  projectSlug: string;
  targetChapterId: string;
  healthReportId: string;
  healthFingerprint: string;
  retrievalId: string;
  retrievalFingerprint: string;
  continuityAuditId?: string;
  continuityAuditFingerprint?: string;
  projectionStatus: MemoryProjectionFreshness["status"];
  affectedClaimIds: string[];
  contradictionSetIds: string[];
  status: "ready" | "blocked";
  blockers: string[];
  sourceRefs: string[];
  generatedAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const proofPath = (root: string, proofId: string) => resolveInside(root, `memory/ready-proofs/${proofId}.json`);

export function buildMemoryReadyProof(input: { projectSlug: string; targetChapterId: string; health: Pick<MemoryHealthReport, "reportId" | "fingerprint" | "status">; preview: Pick<MemoryRetrievalPreview, "retrievalId" | "resultFingerprint" | "sourceResultFingerprint" | "query" | "boundary" | "evidenceProfile">; continuityAudit?: Pick<LongContinuityAudit, "auditId" | "fingerprint" | "status">; projection: MemoryProjectionFreshness; contradictionSetIds: readonly string[] }): MemoryReadyProof {
  if (!input.projectSlug.trim() || !input.targetChapterId.trim() || !input.health.reportId.trim() || !input.preview.retrievalId.trim() || !input.preview.query.trim()) throw new Error("MEMORY_READY_PROOF_INPUT_REQUIRED");
  const retrievalGapBlockers = (input.preview.evidenceProfile?.gaps || [])
    .filter((gap) => ["not-found", "permission-blocked", "time-unknown", "extraction-failed", "conflict"].includes(gap))
    .sort()
    .map((gap) => `MEMORY_RETRIEVAL_EVIDENCE_GAP_${gap.replace(/-/g, "_").toUpperCase()}`);
  const continuityBlockers = input.continuityAudit && input.continuityAudit.status !== "audited-consistent" ? ["MEMORY_CONTINUITY_AUDIT_BLOCKED"] : [];
  const blockers = [...(input.health.status !== "healthy" ? [`MEMORY_HEALTH_${input.health.status.toUpperCase()}`] : []), ...retrievalGapBlockers, ...continuityBlockers, ...(input.projection.status === "current" ? [] : input.projection.blockingReasons.length ? input.projection.blockingReasons : ["MEMORY_PROJECTION_NOT_CURRENT"]), ...(input.contradictionSetIds.length ? ["MEMORY_CONTRADICTION_UNRESOLVED"] : [])];
  const base = { schemaVersion: "memory-ready-proof.v1" as const, proofId: "", projectSlug: input.projectSlug.trim(), targetChapterId: input.targetChapterId.trim(), healthReportId: input.health.reportId, healthFingerprint: input.health.fingerprint, retrievalId: input.preview.retrievalId, retrievalFingerprint: input.preview.resultFingerprint, ...(input.continuityAudit ? { continuityAuditId: input.continuityAudit.auditId, continuityAuditFingerprint: input.continuityAudit.fingerprint } : {}), projectionStatus: input.projection.status, affectedClaimIds: [...input.projection.affectedClaimIds].sort(), contradictionSetIds: [...input.contradictionSetIds].sort(), status: blockers.length ? "blocked" as const : "ready" as const, blockers: [...new Set(blockers)], sourceRefs: [`memory/health-reports/${input.health.reportId}.json`, `memory/retrievals/${input.preview.retrievalId}.json`, ...(input.continuityAudit ? [`memory/continuity-audits/${input.continuityAudit.auditId}.json`] : []), "memory/claims/events.jsonl", "memory/claims/relations.jsonl"], generatedAt: new Date().toISOString() };
  const proofId = `memory-ready-${hash({ ...base, generatedAt: undefined }).slice(0, 24)}`;
  const withId = { ...base, proofId };
  return { ...withId, fingerprint: hash(withId) };
}

function assertIntegrity(proof: MemoryReadyProof): MemoryReadyProof {
  const { fingerprint, ...base } = proof;
  if (proof.schemaVersion !== "memory-ready-proof.v1" || !/^memory-ready-[a-f0-9]{24}$/.test(proof.proofId) || !proof.projectSlug.trim() || !proof.targetChapterId.trim() || !["ready", "blocked"].includes(proof.status) || !Array.isArray(proof.blockers) || (proof.continuityAuditId !== undefined && !/^continuity-audit-[a-f0-9]{24}$/.test(proof.continuityAuditId)) || (proof.continuityAuditFingerprint !== undefined && !/^[a-f0-9]{64}$/i.test(proof.continuityAuditFingerprint)) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("MEMORY_READY_PROOF_INTEGRITY_FAILED");
  return proof;
}

export async function persistMemoryReadyProof(root: string, proof: MemoryReadyProof): Promise<MemoryReadyProof> {
  assertIntegrity(proof);
  const target = proofPath(root, proof.proofId);
  try { const existing = assertIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as MemoryReadyProof); if (existing.fingerprint !== proof.fingerprint) throw new Error("MEMORY_READY_PROOF_CONFLICT"); return existing; }
  catch (error) { if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error; }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return proof;
}

export async function readMemoryReadyProof(root: string, proofId: string): Promise<MemoryReadyProof | null> {
  try { return assertIntegrity(JSON.parse(await fs.readFile(proofPath(root, proofId), "utf8")) as MemoryReadyProof); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
