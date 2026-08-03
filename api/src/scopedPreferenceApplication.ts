import type { PreferenceProbeSelection } from "./dialogueMemoryGovernance.js";

export function evaluateScopedPreferenceApplication(selection: PreferenceProbeSelection, input: { targetContext: string; hasScopeEvidence: boolean }): { applicable: boolean; reason: "IN_SCOPE" | "SCOPE_EVIDENCE_REQUIRED" | "REVOKED"; preference: string } {
  if (selection.status !== "active") return { applicable: false, reason: "REVOKED", preference: selection.hypothesis };
  if (selection.scope === "project") return { applicable: input.hasScopeEvidence, reason: input.hasScopeEvidence ? "IN_SCOPE" : "SCOPE_EVIDENCE_REQUIRED", preference: selection.hypothesis };
  const inValidationContext = selection.validationContexts.includes(input.targetContext);
  return { applicable: inValidationContext, reason: inValidationContext ? "IN_SCOPE" : "SCOPE_EVIDENCE_REQUIRED", preference: selection.hypothesis };
}
