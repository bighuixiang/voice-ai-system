import crypto from "node:crypto";

export interface ObligationClosureGate {
  schemaVersion: "obligation-closure-gate.v1";
  status: "audited_complete" | "blocked";
  blockers: string[];
  sourceCoverageComplete: boolean;
  unresolvedCandidateCount: number;
  conflictCount: number;
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateObligationClosureGate(input: {
  obligations: ReadonlyArray<{ obligationId: string; status: string; evidenceFresh: boolean }>;
  sourceCoverageComplete: boolean;
  unresolvedCandidateCount: number;
  conflictCount: number;
  intentionalOpen: ReadonlyArray<{ obligationId: string; authorAuthorized: boolean; fairnessEvidence: string[]; answeredSubclaims: string[]; sequelInheritance: boolean }>;
}): ObligationClosureGate {
  const blockers = input.obligations.filter((item) => item.status !== "paid" && item.status !== "intentional_open").map((item) => item.obligationId);
  blockers.push(...input.obligations.filter((item) => (item.status === "paid" || item.status === "intentional_open") && !item.evidenceFresh).map((item) => `${item.obligationId}:stale-evidence`));
  if (!input.sourceCoverageComplete) blockers.push("source-coverage");
  if (input.unresolvedCandidateCount > 0) blockers.push("unresolved-candidates");
  if (input.conflictCount > 0) blockers.push("unresolved-conflicts");
  for (const item of input.intentionalOpen) {
    if (!item.authorAuthorized || !item.fairnessEvidence.length || !item.answeredSubclaims.length || !item.sequelInheritance) blockers.push(`${item.obligationId}:intentional-open-contract`);
  }
  const base = { schemaVersion: "obligation-closure-gate.v1" as const, status: blockers.length ? "blocked" as const : "audited_complete" as const, blockers: [...new Set(blockers)], sourceCoverageComplete: input.sourceCoverageComplete, unresolvedCandidateCount: input.unresolvedCandidateCount, conflictCount: input.conflictCount };
  return { ...base, fingerprint: hash(base) };
}
