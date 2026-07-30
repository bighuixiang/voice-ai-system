import { describe, expect, it } from "vitest";
import { createEvaluationSuite, freezeEvaluationInput, createBlindPair, calibrateEvaluator, detectEvaluationContamination, monitorEvaluatorDrift, createReleaseDecision } from "./evaluationGovernance.js";

describe("evaluation governance", () => {
  it("creates a versioned layered evaluation suite", () => {
    const suite = createEvaluationSuite({ suiteId: "suite-1", version: "v1", layers: ["synthetic-counterexample", "authorized-real", "project-preference", "sequence", "fault-injection"], domains: ["intent", "prose", "closure"], holdoutId: "holdout-1" });
    expect(suite.version).toBe("v1");
  });

  it("freezes all comparison inputs and reports confounders", () => {
    const frozen = freezeEvaluationInput({ contractFingerprint: "c1", contextFingerprint: "x1", tools: ["none"], outputBudget: 1000, sampling: { seed: 1, temperature: 0.2 }, changedVariables: ["model"], confounders: [] });
    expect(frozen.comparable).toBe(true);
  });

  it("creates blind randomized pair comparisons", () => {
    const pair = createBlindPair({ comparisonId: "cmp-1", leftCandidate: "a", rightCandidate: "b", target: "continue reading", randomizationSeed: 1 });
    expect(pair.blinded).toBe(true);
    expect(pair.presentedOrder).toHaveLength(2);
  });

  it("keeps uncalibrated evaluators experimental", () => {
    expect(calibrateEvaluator({ evaluatorId: "e-1", calibrationSamples: 1, humanAgreement: 0.4, detectsKnownFailures: ["pov-leak"] }).status).toBe("experimental");
  });

  it("invalidates runs that expose holdout answers and detects evaluator drift", () => {
    expect(detectEvaluationContamination({ holdoutId: "h1", visibleData: ["answer phrase"], output: "contains answer phrase" }).status).toBe("invalid");
    expect(monitorEvaluatorDrift({ previousAgreement: 0.8, currentAgreement: 0.5, previousBias: 0.1, currentBias: 0.4 }).status).toBe("recalibrate");
  });

  it("requires hard gates, key-slice evidence and rollback before release", () => {
    const decision = createReleaseDecision({ releaseId: "rel-1", hardGatesPassed: true, keySliceRegressions: [], blindPairWinRate: 0.7, minimumWinRate: 0.6, evidenceComplete: true, rollbackRef: "rel-0", shadowValidated: true, canaryValidated: true });
    expect(decision.status).toBe("approved");
  });
});
