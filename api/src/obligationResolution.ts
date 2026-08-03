import crypto from "node:crypto";

export interface PartialPayoff { schemaVersion: "partial-payoff.v1"; obligationId: string; status: "partially_paid"; answeredClaims: string[]; remainingClaims: string[]; newWindow: string; evidenceRefs: string[]; fingerprint: string; }
export interface ObligationTransformation { schemaVersion: "obligation-transformation.v1"; parentObligationId: string; targetObligationId: string; targetType: string; reason: string; preservedClaims: string[]; inheritedWindow: string; fingerprint: string; }
export interface ObligationMergeProposal { schemaVersion: "obligation-merge-proposal.v1"; obligationIds: string[]; sharedEntityRefs: string[]; sourceRefs: string[]; payoffConditions: string[]; status: "proposal"; fingerprint: string; }
export interface ObligationConflict { schemaVersion: "obligation-conflict.v1"; conflictId: string; obligations: Array<{ obligationId: string; requirement: string; window: string; knowledge: string }>; alternatives: string[]; status: "blocked"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const trace = (value: string) => /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value);
export function recordPartialPayoff(input: Omit<PartialPayoff, "schemaVersion" | "status" | "fingerprint">): PartialPayoff {
  if (!input.obligationId.trim() || !input.answeredClaims.length || !input.remainingClaims.length || !input.newWindow.trim() || !input.evidenceRefs.length || input.evidenceRefs.some((ref) => !trace(ref))) throw new Error("PARTIAL_PAYOFF_FIELDS_REQUIRED");
  const base = { schemaVersion: "partial-payoff.v1" as const, ...input, answeredClaims: [...input.answeredClaims], remainingClaims: [...input.remainingClaims], evidenceRefs: [...input.evidenceRefs], status: "partially_paid" as const };
  return { ...base, fingerprint: hash(base) };
}
export function transformObligation(input: (Omit<ObligationTransformation, "schemaVersion" | "fingerprint" | "parentObligationId"> & { parentObligationId?: string; sourceObligationId?: string })): ObligationTransformation {
  const parentObligationId = input.parentObligationId ?? input.sourceObligationId ?? "";
  if (!parentObligationId.trim() || !input.targetObligationId.trim() || !input.targetType.trim() || !input.reason.trim() || !input.preservedClaims.length || !input.inheritedWindow.trim()) throw new Error("OBLIGATION_TRANSFORM_FIELDS_REQUIRED");
  const base = { schemaVersion: "obligation-transformation.v1" as const, parentObligationId, targetObligationId: input.targetObligationId, targetType: input.targetType, reason: input.reason, preservedClaims: [...input.preservedClaims], inheritedWindow: input.inheritedWindow };
  return { ...base, fingerprint: hash(base) };
}
export function proposeObligationMerge(input: Omit<ObligationMergeProposal, "schemaVersion" | "status" | "fingerprint">): ObligationMergeProposal {
  if (input.obligationIds.length < 2 || !input.sharedEntityRefs.length || input.sourceRefs.length < input.obligationIds.length || input.payoffConditions.length < input.obligationIds.length || new Set(input.payoffConditions).size < input.obligationIds.length) throw new Error("OBLIGATION_MERGE_FIELDS_REQUIRED");
  const base = { schemaVersion: "obligation-merge-proposal.v1" as const, ...input, obligationIds: [...input.obligationIds], sharedEntityRefs: [...input.sharedEntityRefs], sourceRefs: [...input.sourceRefs], payoffConditions: [...input.payoffConditions], status: "proposal" as const };
  return { ...base, fingerprint: hash(base) };
}
export function detectObligationConflict(input: Omit<ObligationConflict, "schemaVersion" | "status" | "fingerprint">): ObligationConflict {
  if (!input.conflictId.trim() || input.obligations.length < 2 || !input.alternatives.length) throw new Error("OBLIGATION_CONFLICT_FIELDS_REQUIRED");
  const base = { schemaVersion: "obligation-conflict.v1" as const, ...input, obligations: input.obligations.map((obligation) => ({ ...obligation })), alternatives: [...input.alternatives], status: "blocked" as const };
  return { ...base, fingerprint: hash(base) };
}
