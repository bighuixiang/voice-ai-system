import crypto from "node:crypto";

export interface WorldRuleException { schemaVersion: "world-rule-exception.v1"; exceptionId: string; ruleId: string; trigger: string; informedParties: string[]; repeatability: "one-time" | "repeatable"; cost: string; proseEvidenceRefs: string[]; explanationWindow: string; sourceRefs: string[]; explanationDebtId: string; status: "open" | "settled"; settlementRefs?: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function recordWorldRuleException(input: Omit<WorldRuleException, "schemaVersion" | "explanationDebtId" | "status" | "settlementRefs" | "fingerprint">): WorldRuleException {
  if (!input.exceptionId.trim() || !input.ruleId.trim() || !input.trigger.trim() || !input.explanationWindow.trim()) throw new Error("WORLD_RULE_EXCEPTION_FIELDS_REQUIRED");
  if (!input.informedParties.length) throw new Error("WORLD_RULE_EXCEPTION_KNOWLEDGE_REQUIRED");
  if (!input.cost.trim()) throw new Error("WORLD_RULE_EXCEPTION_COST_REQUIRED");
  if (!input.proseEvidenceRefs.length || !input.sourceRefs.length) throw new Error("WORLD_RULE_EXCEPTION_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "world-rule-exception.v1" as const, ...input, informedParties: [...input.informedParties], proseEvidenceRefs: [...input.proseEvidenceRefs], sourceRefs: [...input.sourceRefs], explanationDebtId: `debt-${input.exceptionId}`, status: "open" as const };
  return { ...base, fingerprint: hash(base) };
}
export function settleWorldRuleException(exception: WorldRuleException, input: { explanationRefs: readonly string[] }): WorldRuleException {
  if (!input.explanationRefs.length) throw new Error("WORLD_RULE_EXCEPTION_SETTLEMENT_EVIDENCE_REQUIRED");
  const base = { ...exception, status: "settled" as const, settlementRefs: [...input.explanationRefs] };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  return { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
}
