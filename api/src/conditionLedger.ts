import crypto from "node:crypto";

export type ConditionKind = "injury" | "mental" | "capability" | "organization";
export interface ConditionLedger { schemaVersion: "condition-ledger.v1"; conditionId: string; subjectId: string; kind: ConditionKind; onset: string; symptoms: string[]; restrictions: string[]; treatmentConditions: string[]; recoveryWindow: string; relapseRisk: string; sourceRefs: string[]; status: "active" | "recovered"; recovery?: { at: string; treatment: string; evidenceRefs: string[] }; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createConditionLedger(input: Omit<ConditionLedger, "schemaVersion" | "status" | "recovery" | "fingerprint">): ConditionLedger {
  if (!input.conditionId.trim() || !input.subjectId.trim() || !input.onset.trim() || !input.recoveryWindow.trim() || !input.relapseRisk.trim()) throw new Error("CONDITION_FIELDS_REQUIRED");
  if (!input.symptoms.length || !input.treatmentConditions.length || !input.sourceRefs.length) throw new Error("CONDITION_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "condition-ledger.v1" as const, ...input, symptoms: [...input.symptoms], restrictions: [...input.restrictions], treatmentConditions: [...input.treatmentConditions], sourceRefs: [...input.sourceRefs], status: "active" as const };
  return { ...base, fingerprint: hash(base) };
}
export function recordConditionRecovery(condition: ConditionLedger, input: { at: string; treatment: string; evidenceRefs: readonly string[] }): ConditionLedger {
  if (!input.at.trim() || !input.treatment.trim()) throw new Error("CONDITION_RECOVERY_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("CONDITION_RECOVERY_EVIDENCE_REQUIRED");
  const base = { ...condition, status: "recovered" as const, recovery: { at: input.at, treatment: input.treatment, evidenceRefs: [...input.evidenceRefs] } };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  return { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
}
export function evaluateCondition(condition: ConditionLedger, action: string): "blocked" | "allowed" | "pseudo-cost" {
  if (condition.status === "recovered") return "allowed";
  if (!condition.restrictions.length) return "pseudo-cost";
  return condition.restrictions.some((restriction) => action.toLowerCase().includes(restriction.toLowerCase().split(" ").pop() ?? "")) ? "blocked" : "allowed";
}
