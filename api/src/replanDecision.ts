import crypto from "node:crypto";

export type ReplanChoice = "keep-plan" | "partial-future" | "retroactive-canon";
export interface ReplanDecision {
  schemaVersion: "replan-decision.v1";
  decisionId: string;
  runId: string;
  triggerEvidence: string[];
  affectedWorkItemIds: string[];
  affectedNodeIds: string[];
  currentGraphVersion: number;
  alternativeGraphVersion: number;
  redArgument: string;
  blueArgument: string;
  authorChoice: ReplanChoice;
  status: "accepted";
  invalidatedAssetIds: string[];
  preservedNodeIds: string[];
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createReplanDecision(input: { runId: string; triggerEvidence: string[]; affectedWorkItemIds: string[]; affectedNodeIds: string[]; currentGraphVersion: number; redArgument: string; blueArgument: string; authorChoice: ReplanChoice; authorizationGranted: boolean; affectedAssetIds?: string[]; impact: { status: "ready" | "blocked"; affectedNodeIds: string[]; unknownNodeIds: string[]; protectedAffectedNodeIds: string[]; unaffectedNodeIds: string[] } }): ReplanDecision {
  if (!input.runId.trim() || !input.triggerEvidence.length || !input.affectedWorkItemIds.length || !Number.isInteger(input.currentGraphVersion) || input.currentGraphVersion < 1 || !input.redArgument.trim() || !input.blueArgument.trim()) throw new Error("REPLAN_FIELDS_INVALID");
  if (input.impact.status !== "ready" || input.impact.unknownNodeIds.length || input.impact.protectedAffectedNodeIds.length) throw new Error("REPLAN_IMPACT_BLOCKED");
  const declared = [...new Set(input.affectedNodeIds)].sort();
  const impacted = [...new Set(input.impact.affectedNodeIds)].sort();
  if (!declared.length || declared.length !== impacted.length || declared.some((id, index) => id !== impacted[index])) throw new Error("REPLAN_SCOPE_INCOMPLETE");
  if (input.authorChoice === "retroactive-canon" && !input.authorizationGranted) throw new Error("RETROACTIVE_REPLAN_AUTHORIZATION_REQUIRED");
  const base = { schemaVersion: "replan-decision.v1" as const, decisionId: `replan-${hash(input).slice(0, 20)}`, runId: input.runId, triggerEvidence: [...input.triggerEvidence], affectedWorkItemIds: [...input.affectedWorkItemIds], affectedNodeIds: declared, currentGraphVersion: input.currentGraphVersion, alternativeGraphVersion: input.currentGraphVersion + 1, redArgument: input.redArgument, blueArgument: input.blueArgument, authorChoice: input.authorChoice, status: "accepted" as const, invalidatedAssetIds: input.authorChoice === "retroactive-canon" ? [...(input.affectedAssetIds || [])] : [], preservedNodeIds: [...new Set(input.impact.unaffectedNodeIds)].sort() };
  return { ...base, fingerprint: hash(base) };
}
