import crypto from "node:crypto";
import type { CreativeObjectiveItem } from "./creativeObjective.js";

export interface ObjectiveOverride { objectiveId: string; replacement: CreativeObjectiveItem; reason: string; validWindow: string; restorePoint: string; }
export interface ResolvedObjectiveHierarchy { schemaVersion: "objective-hierarchy.v1"; scope: CreativeObjectiveItem["scope"]; inherited: CreativeObjectiveItem[]; local: CreativeObjectiveItem[]; overrides: ObjectiveOverride[]; blockedOverrides: string[]; fingerprint: string; }
export interface ObjectiveContribution { schemaVersion: "objective-contribution.v1"; workItemId: string; nearTerm: { outcome: string; satisfied: boolean; evidenceRefs: string[] }; longTerm: { targets: string[]; contributes: boolean; evidenceRefs: string[] }; status: "supported" | "blocked"; reasons: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function resolveObjectiveHierarchy(input: { scope: CreativeObjectiveItem["scope"]; ancestors: CreativeObjectiveItem[]; local: CreativeObjectiveItem[]; overrides: ObjectiveOverride[] }): ResolvedObjectiveHierarchy {
  const blockedOverrides: string[] = [];
  for (const override of input.overrides) {
    const inherited = input.ancestors.find((item) => item.objectiveId === override.objectiveId);
    if (!inherited) blockedOverrides.push(`${override.objectiveId}:not-inherited`);
    else if (inherited.kind === "hard_constraint" && override.replacement.kind !== "hard_constraint") blockedOverrides.push(`${override.objectiveId}:hard-constraint`);
    if (!override.reason.trim() || !override.validWindow.trim() || !override.restorePoint.trim()) blockedOverrides.push(`${override.objectiveId}:override-audit-required`);
  }
  const overridden = new Set(input.overrides.filter((override) => !blockedOverrides.includes(`${override.objectiveId}:hard-constraint`) && !blockedOverrides.includes(`${override.objectiveId}:not-inherited`)).map((override) => override.objectiveId));
  const inherited = input.ancestors.filter((item) => !overridden.has(item.objectiveId)).map((item) => ({ ...item, sourceRefs: [...item.sourceRefs] }));
  const base = { schemaVersion: "objective-hierarchy.v1" as const, scope: input.scope, inherited, local: input.local.map((item) => ({ ...item, sourceRefs: [...item.sourceRefs] })), overrides: input.overrides.map((override) => ({ ...override, replacement: { ...override.replacement, sourceRefs: [...override.replacement.sourceRefs] } })), blockedOverrides: [...new Set(blockedOverrides)] };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateObjectiveContribution(input: { workItemId: string; nearTermOutcome: string; nearTermSatisfied: boolean; nearTermEvidenceRefs: string[]; longTermTargets: string[]; contributesLongTerm: boolean; longTermEvidenceRefs: string[] }): ObjectiveContribution {
  const reasons: string[] = [];
  if (!input.workItemId.trim() || !input.nearTermOutcome.trim()) reasons.push("OBJECTIVE_CONTRIBUTION_FIELDS_REQUIRED");
  if (!input.nearTermEvidenceRefs.length) reasons.push("NEAR_TERM_EVIDENCE_REQUIRED");
  if (!input.longTermTargets.length) reasons.push("LONG_TERM_TARGET_REQUIRED");
  if (!input.longTermEvidenceRefs.length) reasons.push("LONG_TERM_EVIDENCE_REQUIRED");
  if (!input.nearTermSatisfied) reasons.push("NEAR_TERM_OUTCOME_UNSATISFIED");
  if (!input.contributesLongTerm) reasons.push("LONG_TERM_CONTRIBUTION_UNSUPPORTED");
  const base = { schemaVersion: "objective-contribution.v1" as const, workItemId: input.workItemId, nearTerm: { outcome: input.nearTermOutcome, satisfied: input.nearTermSatisfied, evidenceRefs: [...input.nearTermEvidenceRefs] }, longTerm: { targets: [...input.longTermTargets], contributes: input.contributesLongTerm, evidenceRefs: [...input.longTermEvidenceRefs] }, status: reasons.length ? "blocked" as const : "supported" as const, reasons: [...new Set(reasons)] };
  return { ...base, fingerprint: hash(base) };
}
