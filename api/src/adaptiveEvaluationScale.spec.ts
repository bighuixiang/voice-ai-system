import { describe, expect, it } from "vitest";
import { assertAdaptiveEvaluationScaleIntegrity, buildAdaptiveEvaluationScale } from "./adaptiveEvaluationScale.js";

describe("adaptive evaluation scale", () => {
  it("activates dimensions by chapter function and excludes not-applicable scores", () => {
    const result = buildAdaptiveEvaluationScale({ chapterFunction: "aftermath", scores: { emotion: 0.8, relationship: 0.6, conflict: 0 } });
    expect(result.dimensions).toEqual(expect.arrayContaining([
      { dimension: "emotion", score: 0.8, status: "applicable" },
      { dimension: "relationship", score: 0.6, status: "applicable" },
      { dimension: "conflict", score: null, status: "not_applicable" }
    ]));
    expect(result.average).toBeCloseTo(0.7);
    expect(() => assertAdaptiveEvaluationScaleIntegrity(result)).not.toThrow();
    expect(() => assertAdaptiveEvaluationScaleIntegrity({ ...result, average: 0.9 })).toThrow("EVALUATION_SCALE_INTEGRITY_FAILED");
  });

  it("rejects invalid scores instead of turning them into quality claims", () => {
    expect(() => buildAdaptiveEvaluationScale({ chapterFunction: "puzzle", scores: { "fair-clues": 2 } })).toThrow("EVALUATION_SCORE_INVALID");
  });
});
