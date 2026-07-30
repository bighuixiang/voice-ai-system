import crypto from "node:crypto";

export interface WorldRuleDisclosurePlan { schemaVersion: "world-rule-disclosure.v1"; disclosureId: string; ruleId: string; actionId: string; readerVisible: string[]; readerKnowledge: string; characterKnowledge: string[]; objectiveTruth: string; hiddenUntil: string; clueRefs: string[]; status: "fair" | "hidden"; evidenceRefs: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function planWorldRuleDisclosure(input: { disclosureId: string; ruleId: string; actionId: string; observableFacts: readonly string[]; readerKnowledge: string; characterKnowledge: readonly string[]; objectiveTruth: string; requiredForChoice: boolean; hiddenUntil: string; clueRefs: readonly string[]; evidenceRefs: readonly string[] }): WorldRuleDisclosurePlan {
  if (!input.disclosureId.trim() || !input.ruleId.trim() || !input.actionId.trim() || !input.objectiveTruth.trim()) throw new Error("WORLD_RULE_DISCLOSURE_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("WORLD_RULE_DISCLOSURE_EVIDENCE_REQUIRED");
  if (input.requiredForChoice && (!input.observableFacts.length || !input.readerKnowledge.trim())) throw new Error("WORLD_RULE_OBSERVABLE_FACT_REQUIRED");
  if (input.requiredForChoice && input.hiddenUntil.trim() && !input.clueRefs.length) throw new Error("WORLD_RULE_READER_FAIRNESS_REQUIRED");
  const base = { schemaVersion: "world-rule-disclosure.v1" as const, disclosureId: input.disclosureId, ruleId: input.ruleId, actionId: input.actionId, readerVisible: [...input.observableFacts], readerKnowledge: input.readerKnowledge, characterKnowledge: [...input.characterKnowledge], objectiveTruth: input.objectiveTruth, hiddenUntil: input.hiddenUntil, clueRefs: [...input.clueRefs], status: input.requiredForChoice ? "fair" as const : "hidden" as const, evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}
