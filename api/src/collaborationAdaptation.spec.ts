import { describe, expect, it } from "vitest";
import { assertCollaborationAdjustmentIntegrity, proposeCollaborationAdjustment } from "./collaborationAdaptation.js";

describe("collaboration intensity adaptation", () => {
  it("proposes a narrow reversible adjustment from observable behavior", () => {
    const suggestion = proposeCollaborationAdjustment({
      observations: { skippedExplanations: 3, corrections: 1, evidenceOpened: 0, candidateRejections: 0 },
      explicitStrategy: undefined,
    });
    expect(suggestion).toMatchObject({ mode: "more-automatic", reversible: true, importantGatesProtected: true, scope: "explanation-detail" });
    expect(suggestion.reasonCodes).toContain("REPEATED_EXPLANATION_SKIPS");
    expect(() => assertCollaborationAdjustmentIntegrity(suggestion)).not.toThrow();
    expect(() => assertCollaborationAdjustmentIntegrity({ ...suggestion, scope: "none" })).toThrow("COLLABORATION_ADJUSTMENT_INTEGRITY_FAILED");
  });

  it("prefers explicit author strategy and never infers a permanent preference", () => {
    const suggestion = proposeCollaborationAdjustment({
      observations: { skippedExplanations: 9, corrections: 0, evidenceOpened: 0, candidateRejections: 0 },
      explicitStrategy: "more-detail",
    });
    expect(suggestion.mode).toBe("more-detail");
    expect(suggestion.permanent).toBe(false);
    expect(suggestion.scope).toBe("review-evidence");
  });

  it("does not suggest a change from silence or emotion-like signals", () => {
    const suggestion = proposeCollaborationAdjustment({ observations: { skippedExplanations: 0, corrections: 0, evidenceOpened: 0, candidateRejections: 0 }, explicitStrategy: undefined });
    expect(suggestion.mode).toBe("unchanged");
    expect(suggestion.reasonCodes).toEqual([]);
  });
});
