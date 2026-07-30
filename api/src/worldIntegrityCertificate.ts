import crypto from "node:crypto";

export interface WorldIntegrityCertificate { schemaVersion: "world-integrity-certificate.v1"; certificateId: string; publicationId: string; auditVersion: string; scope: string; coverage: { rules: string[]; states: string[]; capabilities: string[]; resources: string[]; time: string[]; organizations: string[] }; openExceptionDebtIds: string[]; conflictIds: string[]; unknowns: string[]; scanFailures: string[]; sourceRefs: string[]; generatedAt: string; status: "certified" | "blocked"; blockers: string[]; claim: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createWorldIntegrityCertificate(input: Omit<WorldIntegrityCertificate, "schemaVersion" | "status" | "blockers" | "claim" | "fingerprint">): WorldIntegrityCertificate {
  if (!input.certificateId.trim() || !input.publicationId.trim() || !input.auditVersion.trim() || !input.scope.trim() || !input.generatedAt.trim()) throw new Error("WORLD_CERTIFICATE_FIELDS_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("WORLD_CERTIFICATE_SOURCE_REQUIRED");
  if (Object.values(input.coverage).some((items) => !items.length)) throw new Error("WORLD_CERTIFICATE_COVERAGE_REQUIRED");
  const blockers = [input.openExceptionDebtIds.length ? "OPEN_EXCEPTION_DEBT" : "", input.conflictIds.length ? "UNRESOLVED_CONFLICTS" : "", input.unknowns.length ? "UNKNOWN_FACTS" : "", input.scanFailures.length ? "SCAN_FAILURES" : ""].filter(Boolean);
  const base = { schemaVersion: "world-integrity-certificate.v1" as const, ...input, coverage: Object.fromEntries(Object.entries(input.coverage).map(([key, items]) => [key, [...items]])) as WorldIntegrityCertificate["coverage"], openExceptionDebtIds: [...input.openExceptionDebtIds], conflictIds: [...input.conflictIds], unknowns: [...input.unknowns], scanFailures: [...input.scanFailures], sourceRefs: [...input.sourceRefs], status: blockers.length ? "blocked" as const : "certified" as const, blockers, claim: `证明${input.scope}指定范围内的世界约束一致性，不声称模拟整个虚构宇宙。` };
  return { ...base, fingerprint: hash(base) };
}
