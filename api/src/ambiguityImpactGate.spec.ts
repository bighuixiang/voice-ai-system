import { describe, expect, it } from "vitest";
import { evaluateAmbiguityImpactGate } from "./ambiguityImpactGate.js";

describe("ambiguity impact gate", () => {
  it("requires one L2 question despite high model confidence for a consequential ending", () => {
    const result = evaluateAmbiguityImpactGate({ questionId: "ending-tone", impact: 0.9, ambiguity: 0.4, confidence: 0.9, alternatives: ["tragic", "redemptive"], irreversible: true });
    expect(result).toMatchObject({ status: "l2_required", confidence: 0.9 });
    expect(result.reasons).toContain("HIGH_IMPACT_AMBIGUITY_REQUIRES_L2");
  });
  it("allows low-impact ambiguity to defer", () => {
    expect(evaluateAmbiguityImpactGate({ questionId: "hair-color", impact: 0.1, ambiguity: 0.8, confidence: 0.2, alternatives: ["black", "brown"], irreversible: false }).status).toBe("safe_to_defer");
  });
});
