import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { BlindPair, ContaminationResult, EvaluationSuite, EvaluatorCalibration, EvaluatorDrift, FrozenEvaluationInput } from "./evaluationGovernance.js";

export interface BlindPairRecord {
  schemaVersion: "evaluation-blind-pair-record.v1";
  projectSlug: string;
  comparisonId: string;
  pair: BlindPair;
  createdAt: string;
  fingerprint: string;
}
export interface FrozenEvaluationInputRecord {
  schemaVersion: "frozen-evaluation-input-record.v1";
  projectSlug: string;
  inputFingerprint: string;
  input: FrozenEvaluationInput;
  createdAt: string;
  fingerprint: string;
}
export interface EvaluationSuiteRecord {
  schemaVersion: "evaluation-suite-record.v1";
  projectSlug: string;
  suiteId: string;
  suite: EvaluationSuite;
  createdAt: string;
  fingerprint: string;
}
export interface EvaluatorCalibrationRecord {
  schemaVersion: "evaluator-calibration-record.v1";
  projectSlug: string;
  evaluatorId: string;
  calibration: EvaluatorCalibration;
  createdAt: string;
  fingerprint: string;
}
export interface ContaminationResultRecord {
  schemaVersion: "evaluation-contamination-record.v1";
  projectSlug: string;
  holdoutId: string;
  contamination: ContaminationResult;
  createdAt: string;
  fingerprint: string;
}
export interface EvaluatorDriftRecord {
  schemaVersion: "evaluator-drift-record.v1";
  projectSlug: string;
  driftId: string;
  drift: EvaluatorDrift;
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function recordPath(root: string, comparisonId: string): string { if (!/^[a-zA-Z0-9._-]+$/.test(comparisonId)) throw new Error("EVALUATION_BLIND_PAIR_ID_INVALID"); return resolveInside(root, `evaluations/blind-pairs/${comparisonId}.json`); }
function inputPath(root: string, inputFingerprint: string): string { if (!/^[a-f0-9]{64}$/i.test(inputFingerprint)) throw new Error("EVALUATION_INPUT_FINGERPRINT_INVALID"); return resolveInside(root, `evaluations/frozen-inputs/${inputFingerprint}.json`); }
function suitePath(root: string, suiteId: string): string { if (!/^[a-zA-Z0-9._-]+$/.test(suiteId)) throw new Error("EVALUATION_SUITE_ID_INVALID"); return resolveInside(root, `evaluations/suites/${suiteId}.json`); }
function calibrationPath(root: string, evaluatorId: string): string { if (!/^[a-zA-Z0-9._-]+$/.test(evaluatorId)) throw new Error("EVALUATOR_ID_INVALID"); return resolveInside(root, `evaluations/calibrations/${evaluatorId}.json`); }
function contaminationPath(root: string, holdoutId: string): string { if (!/^[a-zA-Z0-9._-]+$/.test(holdoutId)) throw new Error("EVALUATION_HOLDOUT_ID_INVALID"); return resolveInside(root, `evaluations/contamination/${holdoutId}.json`); }
function driftPath(root: string, driftId: string): string { if (!/^[a-zA-Z0-9._-]+$/.test(driftId)) throw new Error("EVALUATION_DRIFT_ID_INVALID"); return resolveInside(root, `evaluations/drift/${driftId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }

export function assertBlindPairIntegrity(pair: BlindPair, expectedId?: string): BlindPair {
  const { fingerprint, ...base } = pair;
  const valid = pair?.schemaVersion === "blind-pair.v1" && (!expectedId || pair.comparisonId === expectedId) && typeof pair.comparisonId === "string" && pair.comparisonId.trim() && typeof pair.target === "string" && pair.target.trim() && pair.blinded === true && Array.isArray(pair.presentedOrder) && pair.presentedOrder.length === 2 && pair.presentedOrder.every((candidate) => typeof candidate === "string" && candidate.trim()) && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("EVALUATION_BLIND_PAIR_INTEGRITY_FAILED");
  return pair;
}

export function assertFrozenEvaluationInputIntegrity(input: FrozenEvaluationInput, expectedFingerprint?: string): FrozenEvaluationInput {
  const { fingerprint, ...base } = input;
  const valid = input?.schemaVersion === "frozen-evaluation-input.v1" && (!expectedFingerprint || input.fingerprint === expectedFingerprint) && typeof input.contractFingerprint === "string" && input.contractFingerprint.trim() && typeof input.contextFingerprint === "string" && input.contextFingerprint.trim() && Array.isArray(input.tools) && input.tools.length > 0 && input.tools.every((tool) => typeof tool === "string" && tool.trim()) && Number.isFinite(input.outputBudget) && input.outputBudget > 0 && Number.isInteger(input.sampling?.seed) && Number.isFinite(input.sampling?.temperature) && input.sampling.temperature >= 0 && Array.isArray(input.changedVariables) && input.changedVariables.length > 0 && input.changedVariables.every((value) => typeof value === "string" && value.trim()) && Array.isArray(input.confounders) && input.confounders.every((value) => typeof value === "string" && value.trim()) && input.comparable === (input.confounders.length === 0) && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("FROZEN_EVALUATION_INPUT_INTEGRITY_FAILED");
  return input;
}

export function assertEvaluationSuiteIntegrity(suite: EvaluationSuite, expectedId?: string): EvaluationSuite {
  const { fingerprint, ...base } = suite;
  const valid = suite?.schemaVersion === "evaluation-suite.v1" && (!expectedId || suite.suiteId === expectedId) && typeof suite.suiteId === "string" && suite.suiteId.trim() && typeof suite.version === "string" && suite.version.trim() && Array.isArray(suite.layers) && suite.layers.length >= 3 && suite.layers.every((layer) => typeof layer === "string" && layer.trim()) && Array.isArray(suite.domains) && suite.domains.length > 0 && suite.domains.every((domain) => typeof domain === "string" && domain.trim()) && typeof suite.holdoutId === "string" && suite.holdoutId.trim() && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("EVALUATION_SUITE_INTEGRITY_FAILED");
  return suite;
}

export function assertEvaluatorCalibrationIntegrity(calibration: EvaluatorCalibration, expectedId?: string): EvaluatorCalibration {
  const { fingerprint, ...base } = calibration;
  const valid = calibration?.schemaVersion === "evaluator-calibration.v1" && (!expectedId || calibration.evaluatorId === expectedId) && typeof calibration.evaluatorId === "string" && calibration.evaluatorId.trim() && Number.isInteger(calibration.calibrationSamples) && calibration.calibrationSamples > 0 && Number.isFinite(calibration.humanAgreement) && calibration.humanAgreement >= 0 && calibration.humanAgreement <= 1 && Array.isArray(calibration.detectsKnownFailures) && calibration.detectsKnownFailures.every((failure) => typeof failure === "string" && failure.trim()) && ["calibrated", "experimental"].includes(calibration.status) && calibration.status === (calibration.calibrationSamples >= 3 && calibration.humanAgreement >= 0.7 && calibration.detectsKnownFailures.length >= 3 ? "calibrated" : "experimental") && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("EVALUATOR_CALIBRATION_INTEGRITY_FAILED");
  return calibration;
}

export function assertContaminationResultIntegrity(contamination: ContaminationResult, expectedId?: string): ContaminationResult {
  const { fingerprint, ...base } = contamination;
  const valid = contamination?.schemaVersion === "evaluation-contamination.v1" && (!expectedId || contamination.holdoutId === expectedId) && typeof contamination.holdoutId === "string" && contamination.holdoutId.trim() && ["valid", "invalid"].includes(contamination.status) && Array.isArray(contamination.evidence) && contamination.evidence.every((item) => typeof item === "string" && item.trim()) && contamination.status === (contamination.evidence.length > 0 ? "invalid" : "valid") && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("EVALUATION_CONTAMINATION_INTEGRITY_FAILED");
  return contamination;
}

export function assertEvaluatorDriftIntegrity(drift: EvaluatorDrift, expectedId?: string): EvaluatorDrift {
  const { fingerprint, ...base } = drift;
  const versionChanged = typeof drift.previousVersion === "string" && drift.previousVersion.trim() && typeof drift.currentVersion === "string" && drift.currentVersion.trim() && drift.previousVersion !== drift.currentVersion;
  const recomputeExpected = Boolean(versionChanged || drift.scaleBreak);
  const recalibrateExpected = drift.agreementDelta < -0.1 || drift.biasDelta > 0.1 || drift.scaleBreak || drift.recomputeRequired;
  const valid = drift?.schemaVersion === "evaluator-drift.v1" && (!expectedId || expectedId === "drift") && ["stable", "recalibrate"].includes(drift.status) && Number.isFinite(drift.agreementDelta) && Number.isFinite(drift.biasDelta) && (drift.disagreementRateDelta === undefined || Number.isFinite(drift.disagreementRateDelta)) && [drift.scaleBreak, drift.historyPreserved, drift.recomputeRequired].every((value) => typeof value === "boolean") && (drift.previousVersion === undefined || (typeof drift.previousVersion === "string" && drift.previousVersion.trim())) && (drift.currentVersion === undefined || (typeof drift.currentVersion === "string" && drift.currentVersion.trim())) && drift.recomputeRequired === recomputeExpected && drift.status === (recalibrateExpected ? "recalibrate" : "stable") && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("EVALUATOR_DRIFT_INTEGRITY_FAILED");
  return drift;
}

export async function readBlindPairRecord(root: string, comparisonId: string): Promise<BlindPairRecord | null> {
  try {
    const record = JSON.parse(await fs.readFile(recordPath(root, comparisonId), "utf8")) as BlindPairRecord;
    const { fingerprint, ...base } = record;
    assertBlindPairIntegrity(record.pair, comparisonId);
    if (record.schemaVersion !== "evaluation-blind-pair-record.v1" || record.comparisonId !== comparisonId || typeof record.projectSlug !== "string" || !record.projectSlug.trim() || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("EVALUATION_BLIND_PAIR_INTEGRITY_FAILED");
    return record;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistBlindPair(root: string, projectSlug: string, pair: BlindPair): Promise<{ created: boolean; record: BlindPairRecord }> {
  if (!projectSlug.trim()) throw new Error("EVALUATION_BLIND_PAIR_FIELDS_REQUIRED");
  assertBlindPairIntegrity(pair);
  const existing = await readBlindPairRecord(root, pair.comparisonId);
  if (existing) {
    if (existing.projectSlug !== projectSlug || existing.pair.fingerprint !== pair.fingerprint) throw new Error("EVALUATION_BLIND_PAIR_IMMUTABLE");
    return { created: false, record: existing };
  }
  const base = { schemaVersion: "evaluation-blind-pair-record.v1" as const, projectSlug, comparisonId: pair.comparisonId, pair, createdAt: new Date().toISOString() };
  const record: BlindPairRecord = { ...base, fingerprint: hash(base) };
  await writeJson(recordPath(root, pair.comparisonId), record);
  return { created: true, record };
}

export async function readFrozenEvaluationInputRecord(root: string, inputFingerprint: string): Promise<FrozenEvaluationInputRecord | null> {
  try {
    const record = JSON.parse(await fs.readFile(inputPath(root, inputFingerprint), "utf8")) as FrozenEvaluationInputRecord;
    const { fingerprint, ...base } = record;
    assertFrozenEvaluationInputIntegrity(record.input, inputFingerprint);
    if (record.schemaVersion !== "frozen-evaluation-input-record.v1" || record.inputFingerprint !== inputFingerprint || typeof record.projectSlug !== "string" || !record.projectSlug.trim() || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("FROZEN_EVALUATION_INPUT_INTEGRITY_FAILED");
    return record;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistFrozenEvaluationInput(root: string, projectSlug: string, input: FrozenEvaluationInput): Promise<{ created: boolean; record: FrozenEvaluationInputRecord }> {
  if (!projectSlug.trim()) throw new Error("FROZEN_EVALUATION_INPUT_FIELDS_REQUIRED");
  assertFrozenEvaluationInputIntegrity(input);
  const existing = await readFrozenEvaluationInputRecord(root, input.fingerprint);
  if (existing) {
    if (existing.projectSlug !== projectSlug) throw new Error("FROZEN_EVALUATION_INPUT_IMMUTABLE");
    return { created: false, record: existing };
  }
  const base = { schemaVersion: "frozen-evaluation-input-record.v1" as const, projectSlug, inputFingerprint: input.fingerprint, input, createdAt: new Date().toISOString() };
  const record: FrozenEvaluationInputRecord = { ...base, fingerprint: hash(base) };
  await writeJson(inputPath(root, input.fingerprint), record);
  return { created: true, record };
}

export async function readEvaluationSuiteRecord(root: string, suiteId: string): Promise<EvaluationSuiteRecord | null> {
  try {
    const record = JSON.parse(await fs.readFile(suitePath(root, suiteId), "utf8")) as EvaluationSuiteRecord;
    const { fingerprint, ...base } = record;
    assertEvaluationSuiteIntegrity(record.suite, suiteId);
    if (record.schemaVersion !== "evaluation-suite-record.v1" || record.suiteId !== suiteId || typeof record.projectSlug !== "string" || !record.projectSlug.trim() || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("EVALUATION_SUITE_INTEGRITY_FAILED");
    return record;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistEvaluationSuite(root: string, projectSlug: string, suite: EvaluationSuite): Promise<{ created: boolean; record: EvaluationSuiteRecord }> {
  if (!projectSlug.trim()) throw new Error("EVALUATION_SUITE_FIELDS_REQUIRED");
  assertEvaluationSuiteIntegrity(suite);
  const existing = await readEvaluationSuiteRecord(root, suite.suiteId);
  if (existing) {
    if (existing.projectSlug !== projectSlug || existing.suite.fingerprint !== suite.fingerprint) throw new Error("EVALUATION_SUITE_IMMUTABLE");
    return { created: false, record: existing };
  }
  const base = { schemaVersion: "evaluation-suite-record.v1" as const, projectSlug, suiteId: suite.suiteId, suite, createdAt: new Date().toISOString() };
  const record: EvaluationSuiteRecord = { ...base, fingerprint: hash(base) };
  await writeJson(suitePath(root, suite.suiteId), record);
  return { created: true, record };
}

export async function readEvaluatorCalibrationRecord(root: string, evaluatorId: string): Promise<EvaluatorCalibrationRecord | null> {
  try {
    const record = JSON.parse(await fs.readFile(calibrationPath(root, evaluatorId), "utf8")) as EvaluatorCalibrationRecord;
    const { fingerprint, ...base } = record;
    assertEvaluatorCalibrationIntegrity(record.calibration, evaluatorId);
    if (record.schemaVersion !== "evaluator-calibration-record.v1" || record.evaluatorId !== evaluatorId || typeof record.projectSlug !== "string" || !record.projectSlug.trim() || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("EVALUATOR_CALIBRATION_INTEGRITY_FAILED");
    return record;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistEvaluatorCalibration(root: string, projectSlug: string, calibration: EvaluatorCalibration): Promise<{ created: boolean; record: EvaluatorCalibrationRecord }> {
  if (!projectSlug.trim()) throw new Error("EVALUATOR_CALIBRATION_FIELDS_REQUIRED");
  assertEvaluatorCalibrationIntegrity(calibration);
  const existing = await readEvaluatorCalibrationRecord(root, calibration.evaluatorId);
  if (existing) {
    if (existing.projectSlug !== projectSlug || existing.calibration.fingerprint !== calibration.fingerprint) throw new Error("EVALUATOR_CALIBRATION_IMMUTABLE");
    return { created: false, record: existing };
  }
  const base = { schemaVersion: "evaluator-calibration-record.v1" as const, projectSlug, evaluatorId: calibration.evaluatorId, calibration, createdAt: new Date().toISOString() };
  const record: EvaluatorCalibrationRecord = { ...base, fingerprint: hash(base) };
  await writeJson(calibrationPath(root, calibration.evaluatorId), record);
  return { created: true, record };
}

export async function readContaminationResult(root: string, holdoutId: string): Promise<ContaminationResultRecord | null> {
  try {
    const record = JSON.parse(await fs.readFile(contaminationPath(root, holdoutId), "utf8")) as ContaminationResultRecord;
    const { fingerprint, ...base } = record;
    assertContaminationResultIntegrity(record.contamination, holdoutId);
    if (record.schemaVersion !== "evaluation-contamination-record.v1" || record.holdoutId !== holdoutId || typeof record.projectSlug !== "string" || !record.projectSlug.trim() || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("EVALUATION_CONTAMINATION_INTEGRITY_FAILED");
    return record;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistContaminationResult(root: string, projectSlug: string, contamination: ContaminationResult): Promise<{ created: boolean; record: ContaminationResultRecord }> {
  if (!projectSlug.trim()) throw new Error("EVALUATION_CONTAMINATION_FIELDS_REQUIRED");
  assertContaminationResultIntegrity(contamination);
  const existing = await readContaminationResult(root, contamination.holdoutId);
  if (existing) {
    if (existing.projectSlug !== projectSlug || existing.contamination.fingerprint !== contamination.fingerprint) throw new Error("EVALUATION_CONTAMINATION_IMMUTABLE");
    return { created: false, record: existing };
  }
  const base = { schemaVersion: "evaluation-contamination-record.v1" as const, projectSlug, holdoutId: contamination.holdoutId, contamination, createdAt: new Date().toISOString() };
  const record: ContaminationResultRecord = { ...base, fingerprint: hash(base) };
  await writeJson(contaminationPath(root, contamination.holdoutId), record);
  return { created: true, record };
}

export async function readEvaluatorDrift(root: string, driftId: string): Promise<EvaluatorDriftRecord | null> {
  try {
    const record = JSON.parse(await fs.readFile(driftPath(root, driftId), "utf8")) as EvaluatorDriftRecord;
    const { fingerprint, ...base } = record;
    assertEvaluatorDriftIntegrity(record.drift, "drift");
    if (record.schemaVersion !== "evaluator-drift-record.v1" || record.driftId !== driftId || typeof record.projectSlug !== "string" || !record.projectSlug.trim() || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("EVALUATION_DRIFT_INTEGRITY_FAILED");
    return record;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistEvaluatorDrift(root: string, projectSlug: string, driftId: string, drift: EvaluatorDrift): Promise<{ created: boolean; record: EvaluatorDriftRecord }> {
  if (!projectSlug.trim() || !driftId.trim()) throw new Error("EVALUATION_DRIFT_FIELDS_REQUIRED");
  assertEvaluatorDriftIntegrity(drift);
  const existing = await readEvaluatorDrift(root, driftId);
  if (existing) {
    if (existing.projectSlug !== projectSlug || existing.drift.fingerprint !== drift.fingerprint) throw new Error("EVALUATION_DRIFT_IMMUTABLE");
    return { created: false, record: existing };
  }
  const base = { schemaVersion: "evaluator-drift-record.v1" as const, projectSlug, driftId, drift, createdAt: new Date().toISOString() };
  const record: EvaluatorDriftRecord = { ...base, fingerprint: hash(base) };
  await writeJson(driftPath(root, driftId), record);
  return { created: true, record };
}
