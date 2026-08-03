import { describe, expect, it } from "vitest";
import { createPreferenceProbeSelection } from "./dialogueMemoryGovernance.js";
import { evaluateScopedPreferenceApplication } from "./scopedPreferenceApplication.js";

describe("scoped preference application", () => {
  const probe = { probeId: "funeral-tone", frozenFacts: ["funeral"], dimension: "tone", variants: [{ variantId: "restrained", text: "restrained" }, { variantId: "heated", text: "heated" }] };

  it("does not globalize one scene choice into an unrelated scene", () => {
    const selection = createPreferenceProbeSelection({ probe, selectedVariantId: "restrained", reason: "fits funeral", scope: "scene", validationContexts: ["scene-funeral"], evidenceRefs: ["author://choice/funeral"] });
    expect(evaluateScopedPreferenceApplication(selection, { targetContext: "scene-comedy", hasScopeEvidence: false })).toMatchObject({ applicable: false, reason: "SCOPE_EVIDENCE_REQUIRED" });
    expect(evaluateScopedPreferenceApplication(selection, { targetContext: "scene-funeral", hasScopeEvidence: true })).toMatchObject({ applicable: true, reason: "IN_SCOPE" });
  });

  it("requires explicit scope evidence for a project-wide preference", () => {
    const selection = createPreferenceProbeSelection({ probe, selectedVariantId: "restrained", reason: "author explicitly generalized", scope: "project", validationContexts: [], evidenceRefs: ["author://project-policy"] });
    expect(evaluateScopedPreferenceApplication(selection, { targetContext: "scene-comedy", hasScopeEvidence: false }).applicable).toBe(false);
    expect(evaluateScopedPreferenceApplication(selection, { targetContext: "scene-comedy", hasScopeEvidence: true }).applicable).toBe(true);
  });
});
