import { describe, expect, it } from "vitest";
import { compareEvaluationCandidate } from "./evaluationPareto.js";

const baseline = { candidateId: "baseline", validOutputRate: 0.95, blindWinRate: 0.6, hardFailures: 0, costCents: 10, latencyMs: 1000, keySliceRegression: false };

describe("evaluation pareto decision", () => {
  it("accepts a cheaper candidate only when quality is non-inferior", () => {
    expect(compareEvaluationCandidate({ baseline, candidate: { ...baseline, candidateId: "candidate", costCents: 7 }, minimumWinRate: 0.55 })).toMatchObject({ qualityNonInferior: true, costImprovement: true, eligibleDefault: true });
  });

  it("rejects cost wins that hide hard or key-slice regression", () => {
    expect(compareEvaluationCandidate({ baseline, candidate: { ...baseline, candidateId: "candidate", costCents: 1, validOutputRate: 0.98, keySliceRegression: true }, minimumWinRate: 0.55 })).toMatchObject({ eligibleDefault: false, reasons: expect.arrayContaining(["KEY_SLICE_REGRESSION"]) });
  });

  it("fails with a domain error when candidate metrics are missing", () => {
    expect(() => compareEvaluationCandidate({ baseline, candidate: undefined as never, minimumWinRate: 0.55 })).toThrow("EVALUATION_PARETO_INPUT_INVALID");
  });
});
