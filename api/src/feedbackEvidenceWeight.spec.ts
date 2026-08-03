import { describe, expect, it } from "vitest";
import { classifyFeedbackEvidence } from "./feedbackEvidenceWeight.js";

describe("feedback evidence weight", () => {
  it("weights explicit rejection stronger than reasonless acceptance but never promotes immediately", () => {
    expect(classifyFeedbackEvidence({ decision: "accepted", reason: "", sourceRef: "feedback://a" })).toMatchObject({ strength: "weak", kind: "support", requiresCrossSampleValidation: true });
    expect(classifyFeedbackEvidence({ decision: "rejected", reason: "角色绝不会这样说", sourceRef: "feedback://r" })).toMatchObject({ strength: "strong", kind: "counter", requiresCrossSampleValidation: true });
  });
});
