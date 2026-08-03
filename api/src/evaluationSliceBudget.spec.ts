import { describe, expect, it } from "vitest";
import { createEvaluationSliceBudget, evaluateEvaluationSlice } from "./evaluationSliceBudget.js";

const budget = createEvaluationSliceBudget({ sliceId: "mystery-aftermath-pov1", dimensions: { genre: "mystery", chapterFunction: "aftermath", pov: "hero", lengthBand: "medium", risk: "high", knownDefects: ["flat-emotion"] }, minimumSamples: 3, allowedRegression: 0.02, zeroTolerance: true });

describe("evaluation slice budget", () => {
  it("requires stratified dimensions and sample budgets", () => {
    expect(budget).toMatchObject({ sliceId: "mystery-aftermath-pov1", zeroTolerance: true, minimumSamples: 3 });
  });

  it("blocks hard failures and regressions even when the overall score improves", () => {
    const result = evaluateEvaluationSlice({ budget, samples: 3, baselineScore: 0.8, candidateScore: 0.9, hardFailures: ["pov-leak"] });
    expect(result).toMatchObject({ status: "regression", reasons: expect.arrayContaining(["HARD_FAILURE"]) });
    expect(evaluateEvaluationSlice({ budget, samples: 3, baselineScore: 0.8, candidateScore: 0.77 }).status).toBe("regression");
    expect(evaluateEvaluationSlice({ budget, samples: 1, baselineScore: 0.8, candidateScore: 0.9 }).status).toBe("insufficient-sample");
  });
});
