import crypto from "node:crypto";

export type RuleInteractionOperation = "compose" | "amplify" | "suppress" | "conflict";
export interface WorldRuleInteraction { schemaVersion: "world-rule-interaction.v1"; interactionId: string; ruleIds: string[]; priorityOrder: string[]; operation: RuleInteractionOperation; observedEffect: string; uncertainty: string[]; candidates: string[]; status: "adopted" | "unknown"; replayEventId: string; evidenceRefs: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateWorldRuleInteraction(input: Omit<WorldRuleInteraction, "schemaVersion" | "candidates" | "status" | "replayEventId" | "fingerprint">): WorldRuleInteraction {
  if (!input.interactionId.trim() || input.ruleIds.length < 2 || !input.operation) throw new Error("WORLD_RULE_INTERACTION_FIELDS_REQUIRED");
  if (input.priorityOrder.length !== input.ruleIds.length || input.priorityOrder.some((id) => !input.ruleIds.includes(id)) || new Set(input.priorityOrder).size !== input.ruleIds.length) throw new Error("WORLD_RULE_INTERACTION_PRIORITY_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("WORLD_RULE_INTERACTION_EVIDENCE_REQUIRED");
  const unresolved = input.operation === "conflict" && (!input.observedEffect.trim() || input.uncertainty.length > 0);
  const candidates = unresolved ? input.priorityOrder.map((ruleId) => `candidate:${ruleId}`) : [];
  const base = { schemaVersion: "world-rule-interaction.v1" as const, ...input, ruleIds: [...input.ruleIds], priorityOrder: [...input.priorityOrder], uncertainty: [...input.uncertainty], candidates, status: unresolved ? "unknown" as const : "adopted" as const, replayEventId: `replay-${input.interactionId}`, evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}
export function replayWorldRuleInteraction(interaction: WorldRuleInteraction): { replayEventId: string; observedEffect: string; ruleIds: string[] } {
  if (interaction.status !== "adopted" || !interaction.observedEffect.trim()) throw new Error("WORLD_RULE_INTERACTION_NOT_REPLAYABLE");
  return { replayEventId: interaction.replayEventId, observedEffect: interaction.observedEffect, ruleIds: [...interaction.ruleIds] };
}
