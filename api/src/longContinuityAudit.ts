import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MemoryHealthReport } from "./memoryHealthReport.js";
import { resolveInside } from "./pathSafety.js";

export interface LongContinuityAudit {
  schemaVersion: "long-continuity-audit.v1";
  auditId: string;
  projectSlug: string;
  status: "audited-consistent" | "conditionally-consistent" | "blocked";
  coverage: { totalChapters: number; settledChapters: number; eligibleClaims: number; candidateClaims: number; settledRatio: number };
  contradictionSetIds: string[];
  staleProjectionCount: number;
  issues: string[];
  sourceRefs: string[];
  healthReportId: string;
  healthFingerprint: string;
  generatedAt: string;
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const auditPath = (root: string, auditId: string) => resolveInside(root, `memory/continuity-audits/${auditId}.json`);

export function buildLongContinuityAudit(input: { projectSlug: string; health: Pick<MemoryHealthReport, "reportId" | "fingerprint" | "status" | "coverage" | "staleProjectionCount" | "sourceRefs">; candidateClaims: number; contradictionSetIds: readonly string[] }): LongContinuityAudit {
  if (!input.projectSlug.trim() || !input.health.reportId.trim() || input.candidateClaims < 0) throw new Error("LONG_CONTINUITY_AUDIT_INPUT_REQUIRED");
  const coverage = { totalChapters: input.health.coverage.totalChapters, settledChapters: input.health.coverage.settledChapters, eligibleClaims: input.health.coverage.eligibleClaims, candidateClaims: input.candidateClaims, settledRatio: input.health.coverage.totalChapters ? input.health.coverage.settledChapters / input.health.coverage.totalChapters : 0 };
  const issues = [...(input.health.status === "blocked" ? ["MEMORY_HEALTH_BLOCKED"] : input.health.status === "degraded" ? ["MEMORY_HEALTH_DEGRADED"] : []), ...(coverage.settledRatio < 1 ? ["SETTLED_CHAPTER_COVERAGE_INCOMPLETE"] : []), ...(input.candidateClaims ? ["CANDIDATE_CLAIMS_UNSETTLED"] : []), ...(input.contradictionSetIds.length ? ["CONTRADICTION_SETS_OPEN"] : []), ...(input.health.staleProjectionCount ? ["STALE_PROJECTIONS_PRESENT"] : [])];
  const status = input.health.status === "blocked" || input.contradictionSetIds.length || input.health.staleProjectionCount ? "blocked" as const : issues.length ? "conditionally-consistent" as const : "audited-consistent" as const;
  const base = { schemaVersion: "long-continuity-audit.v1" as const, auditId: "", projectSlug: input.projectSlug.trim(), status, coverage, contradictionSetIds: [...input.contradictionSetIds].sort(), staleProjectionCount: input.health.staleProjectionCount, issues: [...new Set(issues)], sourceRefs: [...new Set([...input.health.sourceRefs, "memory/claims/events.jsonl", "memory/claims/relations.jsonl"])].sort(), healthReportId: input.health.reportId, healthFingerprint: input.health.fingerprint, generatedAt: new Date().toISOString() };
  const auditId = `continuity-audit-${hash({ ...base, generatedAt: undefined }).slice(0, 24)}`;
  const withId = { ...base, auditId };
  return { ...withId, fingerprint: hash(withId) };
}
function assertIntegrity(audit: LongContinuityAudit): LongContinuityAudit { const { fingerprint, ...base } = audit; if (audit.schemaVersion !== "long-continuity-audit.v1" || !/^continuity-audit-[a-f0-9]{24}$/.test(audit.auditId) || !audit.projectSlug.trim() || !["audited-consistent", "conditionally-consistent", "blocked"].includes(audit.status) || !Array.isArray(audit.issues) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("LONG_CONTINUITY_AUDIT_INTEGRITY_FAILED"); return audit; }
export async function persistLongContinuityAudit(root: string, audit: LongContinuityAudit): Promise<LongContinuityAudit> { assertIntegrity(audit); const target = auditPath(root, audit.auditId); try { const existing = assertIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as LongContinuityAudit); if (existing.fingerprint !== audit.fingerprint) throw new Error("LONG_CONTINUITY_AUDIT_CONFLICT"); return existing; } catch (error) { if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error; } await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(audit, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); return audit; }
export async function readLongContinuityAudit(root: string, auditId: string): Promise<LongContinuityAudit | null> { try { return assertIntegrity(JSON.parse(await fs.readFile(auditPath(root, auditId), "utf8")) as LongContinuityAudit); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
