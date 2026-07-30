import crypto from "node:crypto";

export type AdmissionCandidateType = "world-rule" | "texture";
export interface WorldRuleAdmissionResult { schemaVersion: "world-rule-admission.v1"; candidateId: string; candidateType: AdmissionCandidateType; status: "admitted" | "blocked" | "not-applicable"; blockers: string[]; sourceRefs: string[]; evidenceRefs: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateWorldRuleAdmission(input: { candidateId: string; ruleId: string; candidateType?: AdmissionCandidateType; sourceRefs: readonly string[]; solvesCurrentProblem: string; prerequisites: readonly string[]; foreshadowingRefs: readonly string[]; boundaries: readonly string[]; futureCosts: readonly string[]; existingRuleImpacts: readonly string[]; introductionContext: string; evidenceRefs: readonly string[] }): WorldRuleAdmissionResult {
  if (!input.candidateId.trim() || !input.ruleId.trim()) throw new Error("ADMISSION_FIELDS_REQUIRED");
  const candidateType = input.candidateType ?? "world-rule";
  if (candidateType === "texture") { const base = { schemaVersion: "world-rule-admission.v1" as const, candidateId: input.candidateId, candidateType, status: "not-applicable" as const, blockers: [], sourceRefs: [...input.sourceRefs], evidenceRefs: [...input.evidenceRefs] }; return { ...base, fingerprint: hash(base) }; }
  if (!input.sourceRefs.length || !input.evidenceRefs.length) throw new Error("ADMISSION_SOURCE_REQUIRED");
  const blockers: string[] = [];
  if (!input.solvesCurrentProblem.trim()) blockers.push("ADMISSION_PROBLEM_LINK_REQUIRED");
  if (!input.prerequisites.length) blockers.push("ADMISSION_PREREQUISITES_REQUIRED");
  if (!input.foreshadowingRefs.length) blockers.push("ADMISSION_FORESHADOWING_REQUIRED");
  if (!input.boundaries.length) blockers.push("ADMISSION_BOUNDARIES_REQUIRED");
  if (!input.futureCosts.length) blockers.push("ADMISSION_FUTURE_COST_REQUIRED");
  if (!input.existingRuleImpacts.length) blockers.push("ADMISSION_RULE_IMPACT_REQUIRED");
  if (input.introductionContext.toLowerCase().includes("climax")) blockers.push("ADMISSION_CLIMAX_RULE_BLOCKED");
  const base = { schemaVersion: "world-rule-admission.v1" as const, candidateId: input.candidateId, candidateType, status: blockers.length ? "blocked" as const : "admitted" as const, blockers, sourceRefs: [...input.sourceRefs], evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}
