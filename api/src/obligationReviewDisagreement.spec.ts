import { describe, expect, it } from "vitest";
import { evaluateObligationReviewDisagreement } from "./obligationReviewDisagreement.js";

describe("obligation review disagreement", () => {
  it("keeps a divergent payoff pending instead of averaging it into resolved", () => {
    const result = evaluateObligationReviewDisagreement({ obligationId: "obl-1", payoffRef: "prose://ch-8#p-2", reviewerVerdicts: [{ reviewerId: "blue", verdict: "paid", confidence: 0.9, evidenceRefs: ["prose://ch-8#p-2"] }, { reviewerId: "red", verdict: "partial", confidence: 0.8, evidenceRefs: ["prose://ch-8#p-2"] }], missingSubclaims: ["origin", "cost"] });
    expect(result).toMatchObject({ status: "needs_review", confidenceInterval: [0.8, 0.9], missingSubclaims: ["origin", "cost"] });
    expect(result.reasons).toEqual(expect.arrayContaining(["REVIEWER_VERDICTS_DIVERGE", "SUBCLAIMS_UNANSWERED"]));
  });

  it("resolves only unanimous paid reviews with no missing subclaims", () => {
    const result = evaluateObligationReviewDisagreement({ obligationId: "obl-2", payoffRef: "prose://ch-8#p-3", reviewerVerdicts: [{ reviewerId: "a", verdict: "paid", confidence: 0.7, evidenceRefs: ["prose://ch-8#p-3"] }, { reviewerId: "b", verdict: "paid", confidence: 0.8, evidenceRefs: ["prose://ch-8#p-3"] }], missingSubclaims: [] });
    expect(result.status).toBe("resolved");
  });
});
