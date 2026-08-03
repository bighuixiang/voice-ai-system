import { describe, expect, it } from "vitest";
import { assertEvaluationSamplingSummaryIntegrity, createEvaluationSamplingPlan, evaluateMultiScaleRegression, summarizeEvaluationSampling } from "./evaluationSampling.js";

describe("evaluation sampling and multi-scale regression", () => {
  it("freezes unique seeds and reports validity and failure-tail rates", () => {
    const plan = createEvaluationSamplingPlan({ seeds: [11, 12, 13], temperature: 0.7, topP: 0.9, minSamples: 2, maxSamples: 5, stopRule: "threshold-stable" });
    const summary = summarizeEvaluationSampling({ plan, outcomes: [{ valid: true, win: true, failed: false }, { valid: true, win: false, failed: false }, { valid: false, win: false, failed: true }] });
    expect(summary).toMatchObject({ samples: 3, winRate: 1 / 3, validityRate: 2 / 3, failureTailRate: 1 / 3 });
  });

  it("rejects a summary that is not bound to a real plan fingerprint", () => {
    const plan = createEvaluationSamplingPlan({ seeds: [1, 2], temperature: 0.2, topP: 0.9, minSamples: 2, maxSamples: 2, stopRule: "fixed-count" });
    const summary = summarizeEvaluationSampling({ plan, outcomes: [{ valid: true, win: true, failed: false }, { valid: true, win: false, failed: false }] });
    expect(() => assertEvaluationSamplingSummaryIntegrity(summary, "plan-placeholder")).toThrow("EVALUATION_SAMPLING_SUMMARY_INTEGRITY_FAILED");
  });

  it("blocks a local improvement that regresses a wider scale or hard guard", () => {
    const result = evaluateMultiScaleRegression({ baseline: { selection: 0.7, chapter: 0.8, book: 0.75 }, candidate: { selection: 0.9, chapter: 0.79, book: 0.74 }, hardFailures: ["pov-leak"] });
    expect(result).toMatchObject({ status: "regression", regressions: expect.arrayContaining(["hard:pov-leak", "score:chapter", "score:book"]) });
  });
});
