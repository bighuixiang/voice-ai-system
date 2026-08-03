import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { assertReleaseDecisionIntegrity, createEvaluationSuite, freezeEvaluationInput, createBlindPair, calibrateEvaluator, detectEvaluationContamination, monitorEvaluatorDrift, createReleaseDecision } from "./evaluationGovernance.js";
import { persistReleaseDecision, readReleaseDecision } from "./evaluationGovernance.js";

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

  it("marks scale breaks and preserves historical scores when an evaluator version changes", () => {
    const drift = monitorEvaluatorDrift({
      previousVersion: "judge-v1", currentVersion: "judge-v2",
      previousAgreement: 0.8, currentAgreement: 0.82, previousBias: 0.1, currentBias: 0.12,
      previousDisagreementRate: 0.2, currentDisagreementRate: 0.08,
      historicalScores: [{ caseId: "c1", evaluatorVersion: "judge-v1", score: 0.5 }],
      recomputedScores: [{ caseId: "c1", evaluatorVersion: "judge-v2", score: 0.9 }]
    });
    expect(drift.status).toBe("recalibrate");
    expect(drift.scaleBreak).toBe(true);
    expect(drift.historyPreserved).toBe(true);
    expect(drift.recomputeRequired).toBe(true);
  });

  it("requires hard gates, key-slice evidence and rollback before release", () => {
    const decision = createReleaseDecision({ releaseId: "rel-1", hardGatesPassed: true, keySliceRegressions: [], blindPairWinRate: 0.7, minimumWinRate: 0.6, evidenceComplete: true, rollbackRef: "rel-0", shadowValidated: true, canaryValidated: true, qualityNonInferior: true, actualCostCents: 8, maxCostCents: 10, actualLatencyMs: 800, maxLatencyMs: 1000, criticalSlicesStable: true, paretoEligible: true });
    expect(decision.status).toBe("approved");
  });

  it("does not approve a quality win when cost or latency exceeds the declared envelope", () => {
    const decision = createReleaseDecision({
      releaseId: "rel-cost-latency", hardGatesPassed: true, keySliceRegressions: [], blindPairWinRate: 0.8,
      minimumWinRate: 0.6, evidenceComplete: true, rollbackRef: "rel-0", shadowValidated: true, canaryValidated: true,
      qualityNonInferior: true, actualCostCents: 20, maxCostCents: 10, actualLatencyMs: 1200, maxLatencyMs: 1000,
      criticalSlicesStable: true, paretoEligible: true
    });
    expect(decision.status).toBe("blocked");
    expect(decision.reasons).toEqual(expect.arrayContaining(["cost-envelope", "latency-envelope"]));
  });

  it("persists release decisions immutably for replay and audit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-decision-"));
    try {
      const decision = createReleaseDecision({ releaseId: "release-store-1", hardGatesPassed: true, keySliceRegressions: [], blindPairWinRate: 0.8, minimumWinRate: 0.6, evidenceComplete: true, rollbackRef: "release-0", shadowValidated: true, canaryValidated: true, qualityNonInferior: true, actualCostCents: 8, maxCostCents: 10, actualLatencyMs: 800, maxLatencyMs: 1000, criticalSlicesStable: true, paretoEligible: true });
      await expect(persistReleaseDecision(root, decision)).resolves.toMatchObject({ created: true });
      await expect(readReleaseDecision(root, decision.releaseId)).resolves.toEqual(decision);
      const replacement = createReleaseDecision({ releaseId: decision.releaseId, hardGatesPassed: false, keySliceRegressions: ["slice"], blindPairWinRate: 0.2, minimumWinRate: 0.6, evidenceComplete: false, rollbackRef: "release-0", shadowValidated: true, canaryValidated: true, qualityNonInferior: true, actualCostCents: 8, maxCostCents: 10, actualLatencyMs: 800, maxLatencyMs: 1000, criticalSlicesStable: true, paretoEligible: true });
      await expect(persistReleaseDecision(root, replacement)).rejects.toThrow("RELEASE_DECISION_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("blocks release when quality, critical-slice, cost, or latency evidence is absent", () => {
    const decision = createReleaseDecision({ releaseId: "rel-missing-evidence", hardGatesPassed: true, keySliceRegressions: [], blindPairWinRate: 0.9, minimumWinRate: 0.6, evidenceComplete: true, rollbackRef: "rel-0", shadowValidated: true, canaryValidated: true });
    expect(decision.status).toBe("blocked");
    expect(decision.reasons).toEqual(expect.arrayContaining(["quality-evidence-missing", "critical-slice-evidence-missing", "cost-envelope-missing", "latency-envelope-missing", "pareto-evidence-missing"]));
  });

  it("rejects a recomputed release record that claims approval with reasons", () => {
    const base = { schemaVersion: "release-decision.v1" as const, releaseId: "rel-invalid", status: "approved" as const, reasons: ["quality-not-non-inferior"], rollbackRef: "rel-0", qualityNonInferior: false, costLatencyAccepted: true, paretoEligible: false };
    const decision = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
    expect(() => assertReleaseDecisionIntegrity(decision)).toThrow("RELEASE_DECISION_INTEGRITY_FAILED");
  });
});
