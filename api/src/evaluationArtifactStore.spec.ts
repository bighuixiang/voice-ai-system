import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calibrateEvaluator, createBlindPair, createEvaluationSuite, detectEvaluationContamination, freezeEvaluationInput, monitorEvaluatorDrift } from "./evaluationGovernance.js";
import crypto from "node:crypto";
import { assertBlindPairIntegrity, assertContaminationResultIntegrity, assertEvaluationSuiteIntegrity, assertEvaluatorCalibrationIntegrity, assertEvaluatorDriftIntegrity, assertFrozenEvaluationInputIntegrity, persistBlindPair, persistEvaluationSuite, persistEvaluatorCalibration, persistFrozenEvaluationInput, persistContaminationResult, persistEvaluatorDrift, readBlindPairRecord, readEvaluationSuiteRecord, readEvaluatorCalibrationRecord, readFrozenEvaluationInputRecord, readContaminationResult, readEvaluatorDrift } from "./evaluationArtifactStore.js";

describe("evaluation artifact store", () => {
  it("persists and replays a project-scoped blind pair immutably", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-artifacts-"));
    try {
      const pair = createBlindPair({ comparisonId: "cmp-1", leftCandidate: "a", rightCandidate: "b", target: "voice", randomizationSeed: 1 });
      const first = await persistBlindPair(root, "demo", pair);
      expect(first.created).toBe(true);
      expect(await readBlindPairRecord(root, pair.comparisonId)).toEqual(first.record);
      expect((await persistBlindPair(root, "demo", pair)).created).toBe(false);
      const changed = createBlindPair({ comparisonId: "cmp-1", leftCandidate: "a", rightCandidate: "c", target: "voice", randomizationSeed: 1 });
      await expect(persistBlindPair(root, "demo", changed)).rejects.toThrow("EVALUATION_BLIND_PAIR_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("rejects a rehashed blind pair with malformed presentation shape", () => {
    const pair = createBlindPair({ comparisonId: "cmp-1", leftCandidate: "a", rightCandidate: "b", target: "voice", randomizationSeed: 1 });
    const { fingerprint: _fingerprint, ...base } = pair;
    const forgedBase = { ...base, presentedOrder: ["a"] };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertBlindPairIntegrity(forged as typeof pair)).toThrow("EVALUATION_BLIND_PAIR_INTEGRITY_FAILED");
  });

  it("persists frozen comparison inputs by content fingerprint", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-inputs-"));
    try {
      const input = freezeEvaluationInput({ contractFingerprint: "contract", contextFingerprint: "context", tools: ["judge-v1"], outputBudget: 100, sampling: { seed: 7, temperature: 0 }, changedVariables: ["candidate"], confounders: [] });
      const first = await persistFrozenEvaluationInput(root, "demo", input);
      expect(first.created).toBe(true);
      expect(await readFrozenEvaluationInputRecord(root, input.fingerprint)).toEqual(first.record);
      expect((await persistFrozenEvaluationInput(root, "demo", input)).created).toBe(false);
      await expect(persistFrozenEvaluationInput(root, "other", input)).rejects.toThrow("FROZEN_EVALUATION_INPUT_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("rejects a rehashed frozen input with inconsistent comparability", () => {
    const input = freezeEvaluationInput({ contractFingerprint: "contract", contextFingerprint: "context", tools: ["judge-v1"], outputBudget: 100, sampling: { seed: 7, temperature: 0 }, changedVariables: ["candidate"], confounders: [] });
    const { fingerprint: _fingerprint, ...base } = input;
    const forgedBase = { ...base, comparable: false };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertFrozenEvaluationInputIntegrity(forged as typeof input)).toThrow("FROZEN_EVALUATION_INPUT_INTEGRITY_FAILED");
  });

  it("persists an evaluation suite as the project holdout contract", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-suites-"));
    try {
      const suite = createEvaluationSuite({ suiteId: "suite-1", version: "v1", layers: ["synthetic", "authorized", "holdout"], domains: ["prose"], holdoutId: "holdout-1" });
      const first = await persistEvaluationSuite(root, "demo", suite);
      expect(first.created).toBe(true);
      expect(await readEvaluationSuiteRecord(root, suite.suiteId)).toEqual(first.record);
      expect((await persistEvaluationSuite(root, "demo", suite)).created).toBe(false);
      await expect(persistEvaluationSuite(root, "other", suite)).rejects.toThrow("EVALUATION_SUITE_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("rejects a rehashed suite with an incomplete layer contract", () => {
    const suite = createEvaluationSuite({ suiteId: "suite-1", version: "v1", layers: ["synthetic", "authorized", "holdout"], domains: ["prose"], holdoutId: "holdout-1" });
    const { fingerprint: _fingerprint, ...base } = suite;
    const forgedBase = { ...base, layers: ["holdout"] };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertEvaluationSuiteIntegrity(forged as typeof suite)).toThrow("EVALUATION_SUITE_INTEGRITY_FAILED");
  });

  it("persists evaluator calibration and rejects a changed calibration for the same evaluator", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-calibration-"));
    try {
      const calibration = calibrateEvaluator({ evaluatorId: "judge-v1", calibrationSamples: 5, humanAgreement: 0.8, detectsKnownFailures: ["pov", "continuity", "template"] });
      const first = await persistEvaluatorCalibration(root, "demo", calibration);
      expect(first.created).toBe(true);
      expect(await readEvaluatorCalibrationRecord(root, calibration.evaluatorId)).toEqual(first.record);
      expect((await persistEvaluatorCalibration(root, "demo", calibration)).created).toBe(false);
      const changed = calibrateEvaluator({ evaluatorId: "judge-v1", calibrationSamples: 6, humanAgreement: 0.9, detectsKnownFailures: ["pov", "continuity", "template"] });
      await expect(persistEvaluatorCalibration(root, "demo", changed)).rejects.toThrow("EVALUATOR_CALIBRATION_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("rejects a rehashed calibration whose status contradicts its evidence", () => {
    const calibration = calibrateEvaluator({ evaluatorId: "judge-v1", calibrationSamples: 5, humanAgreement: 0.8, detectsKnownFailures: ["pov", "continuity", "template"] });
    const { fingerprint: _fingerprint, ...base } = calibration;
    const forgedBase = { ...base, status: "experimental" as const };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertEvaluatorCalibrationIntegrity(forged as typeof calibration)).toThrow("EVALUATOR_CALIBRATION_INTEGRITY_FAILED");
  });

  it("persists contamination checks immutably by holdout and replays them", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-contamination-"));
    try {
      const result = detectEvaluationContamination({ holdoutId: "holdout-1", visibleData: ["safe"], output: "safe output" });
      const first = await persistContaminationResult(root, "demo", result);
      expect(first.created).toBe(true);
      expect(await readContaminationResult(root, result.holdoutId)).toEqual(first.record);
      expect((await persistContaminationResult(root, "demo", result)).created).toBe(false);
      const changed = detectEvaluationContamination({ holdoutId: "holdout-1", visibleData: ["secret"], output: "secret" });
      await expect(persistContaminationResult(root, "demo", changed)).rejects.toThrow("EVALUATION_CONTAMINATION_IMMUTABLE");
      await expect(persistContaminationResult(root, "other", result)).rejects.toThrow("EVALUATION_CONTAMINATION_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("rejects a rehashed contamination result whose status contradicts evidence", () => {
    const result = detectEvaluationContamination({ holdoutId: "holdout-1", visibleData: ["secret"], output: "secret" });
    const { fingerprint: _fingerprint, ...base } = result;
    const forgedBase = { ...base, status: "valid" as const };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertContaminationResultIntegrity(forged as typeof result)).toThrow("EVALUATION_CONTAMINATION_INTEGRITY_FAILED");
  });

  it("persists evaluator drift immutably and keeps historical conclusions replayable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-drift-"));
    try {
      const drift = monitorEvaluatorDrift({ previousAgreement: 0.8, currentAgreement: 0.82, previousBias: 0.02, currentBias: 0.03, previousVersion: "judge-v1", currentVersion: "judge-v1", historicalScores: [{ caseId: "case-1", evaluatorVersion: "judge-v1", score: 0.8 }], recomputedScores: [{ caseId: "case-1", evaluatorVersion: "judge-v1", score: 0.81 }] });
      const first = await persistEvaluatorDrift(root, "demo", "drift-1", drift);
      expect(first.created).toBe(true);
      expect(await readEvaluatorDrift(root, "drift-1")).toEqual(first.record);
      expect((await persistEvaluatorDrift(root, "demo", "drift-1", drift)).created).toBe(false);
      const changed = monitorEvaluatorDrift({ previousAgreement: 0.8, currentAgreement: 0.4, previousBias: 0.02, currentBias: 0.03, previousVersion: "judge-v1", currentVersion: "judge-v2" });
      await expect(persistEvaluatorDrift(root, "demo", "drift-1", changed)).rejects.toThrow("EVALUATION_DRIFT_IMMUTABLE");
      await expect(persistEvaluatorDrift(root, "other", "drift-1", drift)).rejects.toThrow("EVALUATION_DRIFT_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("rejects a rehashed drift result that hides a required recalibration", () => {
    const drift = monitorEvaluatorDrift({ previousAgreement: 0.8, currentAgreement: 0.4, previousBias: 0.02, currentBias: 0.03, previousVersion: "judge-v1", currentVersion: "judge-v2" });
    const { fingerprint: _fingerprint, ...base } = drift;
    const forgedBase = { ...base, status: "stable" as const, recomputeRequired: false };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertEvaluatorDriftIntegrity(forged as typeof drift)).toThrow("EVALUATOR_DRIFT_INTEGRITY_FAILED");
  });
});
