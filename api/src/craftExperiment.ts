import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { PatternTransferPlan } from "./patternTransfer.js";
import { assertCraftHoldoutIntegrity, validateCraftHoldout, type CraftHoldoutResult, type CraftHoldoutCase } from "./craftHoldoutValidation.js";
import type { ProviderEvaluationReport } from "./providerEvaluation.js";
import type { ReaderReviewer } from "./readerReview.js";

export type CraftExperimentStatus = "planned" | "running" | "judged" | "inconclusive" | "failed" | "invalidated";
export interface ExperimentJudgment {
  evaluatorId: string;
  evaluatorKind: "independent-reviewer" | "author";
  winner: "baseline" | "treatment" | "tie" | "uncertain";
  hardGuardsPassed: boolean;
  authorReason: string;
  judgedAt: string;
  fingerprint: string;
}
export interface CraftExperiment {
  schemaVersion: "craft-experiment.v1";
  experimentId: string;
  projectSlug: string;
  transferPlanId: string;
  baselineCandidateId: string;
  treatmentCandidateId: string;
  holdoutSceneIds: string[];
  targetMetrics: string[];
  comparisonDimensions: string[];
  budgetId: string;
  status: CraftExperimentStatus;
  runnerId?: string;
  holdoutValidation?: CraftHoldoutResult;
  providerEvaluation?: ProviderEvaluationReport;
  readerCalibration?: ReaderReviewer;
  judgment?: ExperimentJudgment;
  decision?: { actor: string; decision: "adopt" | "reject"; reason: string; decidedAt: string };
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function experimentPath(root: string, id: string): string { return resolveInside(root, `sessions/craft-experiments/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(tmp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export function assertCraftExperimentIntegrity(record: CraftExperiment): CraftExperiment {
  const { fingerprint, ...content } = record;
  const judgmentValid = !record.judgment || (
    typeof record.judgment.evaluatorId === "string" && record.judgment.evaluatorId.trim() &&
    ["independent-reviewer", "author"].includes(record.judgment.evaluatorKind) &&
    ["baseline", "treatment", "tie", "uncertain"].includes(record.judgment.winner) &&
    typeof record.judgment.hardGuardsPassed === "boolean" && record.judgment.authorReason.trim() &&
    !Number.isNaN(Date.parse(record.judgment.judgedAt)) &&
    hash((({ fingerprint: _judgmentFingerprint, ...judgmentContent }) => judgmentContent)(record.judgment)) === record.judgment.fingerprint
  );
  const decisionValid = !record.decision || (
    record.decision.actor.trim() && ["adopt", "reject"].includes(record.decision.decision) &&
    record.decision.reason.trim() && !Number.isNaN(Date.parse(record.decision.decidedAt))
  );
  const holdoutValid = !record.holdoutValidation || (() => {
    try { return record.holdoutValidation.experimentId === record.experimentId && assertCraftHoldoutIntegrity(record.holdoutValidation).status === record.holdoutValidation.status; } catch { return false; }
  })();
  const providerEvaluationValid = !record.providerEvaluation || (record.providerEvaluation.schemaVersion === "provider-evaluation-report.v1" && typeof record.providerEvaluation.providerRef === "string" && record.providerEvaluation.providerRef.trim() && [record.providerEvaluation.invocationCount, record.providerEvaluation.completedCount, record.providerEvaluation.effectiveOutputRate, record.providerEvaluation.totalCost.amount, record.providerEvaluation.latencyMs.p95].every((value) => Number.isFinite(value) && value >= 0) && ["pass", "blocked"].includes(record.providerEvaluation.decision));
  const readerCalibrationValid = !record.readerCalibration || (record.readerCalibration.schemaVersion === "reader-reviewer.v1" && typeof record.readerCalibration.reviewerId === "string" && record.readerCalibration.reviewerId.trim() && Number.isInteger(record.readerCalibration.humanSamples) && record.readerCalibration.humanSamples >= 0 && typeof record.readerCalibration.blind === "boolean" && Number.isFinite(record.readerCalibration.agreementRate) && record.readerCalibration.agreementRate >= 0 && record.readerCalibration.agreementRate <= 1 && ["calibrated", "experimental"].includes(record.readerCalibration.status));
  const valid = record.schemaVersion === "craft-experiment.v1" && record.experimentId.trim() && record.projectSlug.trim() &&
    record.transferPlanId.trim() && record.baselineCandidateId.trim() && record.treatmentCandidateId.trim() &&
    record.baselineCandidateId !== record.treatmentCandidateId && record.holdoutSceneIds.length > 0 &&
    record.holdoutSceneIds.every((value) => value.trim()) && new Set(record.holdoutSceneIds).size === record.holdoutSceneIds.length &&
    record.targetMetrics.length > 0 && record.targetMetrics.every((value) => value.trim()) &&
    ["planned", "running", "judged", "inconclusive", "failed", "invalidated"].includes(record.status) &&
    !Number.isNaN(Date.parse(record.createdAt)) && !Number.isNaN(Date.parse(record.updatedAt)) && judgmentValid && decisionValid &&
    holdoutValid && providerEvaluationValid && readerCalibrationValid && hash(content) === fingerprint;
  if (!valid) throw new Error("CRAFT_EXPERIMENT_INTEGRITY_FAILED");
  return record;
}

export async function readCraftExperiment(root: string, experimentId: string): Promise<CraftExperiment | null> { const record = await readJson<CraftExperiment>(experimentPath(root, experimentId)); return record ? assertCraftExperimentIntegrity(record) : null; }

export async function listCraftExperiments(root: string, projectSlug: string): Promise<CraftExperiment[]> {
  const directory = resolveInside(root, "sessions/craft-experiments");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<CraftExperiment>(path.join(directory, name))));
  return records.filter((record): record is CraftExperiment => Boolean(record && assertCraftExperimentIntegrity(record).projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createCraftExperiment(input: { root: string; projectSlug: string; transferPlan: PatternTransferPlan; baselineCandidateId: string; treatmentCandidateId: string; holdoutSceneIds: readonly string[]; targetMetrics: readonly string[]; budgetId: string }): Promise<CraftExperiment> {
  if (input.transferPlan.projectSlug !== input.projectSlug || input.transferPlan.status !== "candidate" || input.transferPlan.canonWriteAllowed) throw new Error("CRAFT_EXPERIMENT_TRANSFER_PLAN_INVALID");
  if (!input.holdoutSceneIds.length || input.holdoutSceneIds.some((value) => !value.trim()) || new Set(input.holdoutSceneIds).size !== input.holdoutSceneIds.length) throw new Error("CRAFT_EXPERIMENT_HOLDOUT_REQUIRED");
  if (!input.targetMetrics.length || input.targetMetrics.some((metric) => !metric.trim()) || !input.baselineCandidateId.trim() || !input.treatmentCandidateId.trim() || !input.budgetId.trim()) throw new Error("CRAFT_EXPERIMENT_METADATA_REQUIRED");
  if (input.baselineCandidateId === input.treatmentCandidateId) throw new Error("CRAFT_EXPERIMENT_CANDIDATES_NOT_EQUIVALENT");
  const experimentId = `craft-experiment-${input.projectSlug}-${hash({ plan: input.transferPlan.planId, baseline: input.baselineCandidateId, treatment: input.treatmentCandidateId, holdout: input.holdoutSceneIds }).slice(0, 16)}`;
  const existing = await readCraftExperiment(input.root, experimentId);
  if (existing) return existing;
  const base = { schemaVersion: "craft-experiment.v1" as const, experimentId, projectSlug: input.projectSlug, transferPlanId: input.transferPlan.planId, baselineCandidateId: input.baselineCandidateId, treatmentCandidateId: input.treatmentCandidateId, holdoutSceneIds: [...input.holdoutSceneIds], targetMetrics: [...input.targetMetrics], comparisonDimensions: ["contract-fit", "author-choice", "revision-cost", "voice", "redundancy", "reader-effect"], budgetId: input.budgetId, status: "planned" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const experiment: CraftExperiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experimentId), experiment);
  return experiment;
}

export async function startCraftExperiment(input: { root: string; experimentId: string; runnerId: string }): Promise<CraftExperiment> {
  if (!input.runnerId.trim()) throw new Error("CRAFT_EXPERIMENT_RUNNER_REQUIRED");
  const existing = await readCraftExperiment(input.root, input.experimentId);
  if (!existing) throw new Error("CRAFT_EXPERIMENT_NOT_FOUND");
  if (existing.status !== "planned") return existing;
  const { fingerprint: _fingerprint, ...existingBase } = existing;
  const base = { ...existingBase, status: "running" as const, runnerId: input.runnerId, updatedAt: new Date().toISOString() };
  const experiment: CraftExperiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experiment.experimentId), experiment);
  return experiment;
}

export async function attachCraftProviderEvaluation(input: { root: string; experimentId: string; report: ProviderEvaluationReport }): Promise<CraftExperiment> {
  const existing = await readCraftExperiment(input.root, input.experimentId);
  if (!existing) throw new Error("CRAFT_EXPERIMENT_NOT_FOUND");
  if (input.report.providerRef.trim() === "" || input.report.schemaVersion !== "provider-evaluation-report.v1") throw new Error("CRAFT_EXPERIMENT_PROVIDER_EVALUATION_INVALID");
  const { fingerprint: _fingerprint, ...existingBase } = existing;
  const base = { ...existingBase, providerEvaluation: input.report, updatedAt: new Date().toISOString() };
  const experiment: CraftExperiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experiment.experimentId), experiment);
  return experiment;
}

export async function attachCraftReaderCalibration(input: { root: string; experimentId: string; calibration: ReaderReviewer }): Promise<CraftExperiment> {
  const existing = await readCraftExperiment(input.root, input.experimentId);
  if (!existing) throw new Error("CRAFT_EXPERIMENT_NOT_FOUND");
  if (input.calibration.schemaVersion !== "reader-reviewer.v1" || !input.calibration.reviewerId.trim()) throw new Error("CRAFT_EXPERIMENT_READER_CALIBRATION_INVALID");
  const { fingerprint: _fingerprint, ...existingBase } = existing;
  const base = { ...existingBase, readerCalibration: input.calibration, updatedAt: new Date().toISOString() };
  const experiment: CraftExperiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experiment.experimentId), experiment);
  return experiment;
}

export async function judgeCraftExperiment(input: { root: string; experimentId: string; evaluatorId: string; evaluatorKind: ExperimentJudgment["evaluatorKind"]; winner: ExperimentJudgment["winner"]; hardGuardsPassed: boolean; authorReason: string; holdout?: { extractionSceneIds: readonly string[]; cases: readonly CraftHoldoutCase[]; sourceRefs: readonly string[] } }): Promise<CraftExperiment> {
  const existing = await readCraftExperiment(input.root, input.experimentId);
  if (!existing) throw new Error("CRAFT_EXPERIMENT_NOT_FOUND");
  if (existing.status !== "running") throw new Error("CRAFT_EXPERIMENT_NOT_RUNNING");
  if (!input.evaluatorId.trim() || input.evaluatorId === existing.runnerId || input.evaluatorKind !== "independent-reviewer" || !["baseline", "treatment", "tie", "uncertain"].includes(input.winner)) throw new Error("CRAFT_EXPERIMENT_EVALUATOR_NOT_INDEPENDENT");
  if (!input.authorReason.trim()) throw new Error("CRAFT_EXPERIMENT_JUDGMENT_REASON_REQUIRED");
  const holdoutValidation = input.holdout ? validateCraftHoldout({ experimentId: existing.experimentId, extractionSceneIds: [...input.holdout.extractionSceneIds], cases: [...input.holdout.cases], sourceRefs: [...input.holdout.sourceRefs] }) : existing.holdoutValidation;
  if (input.holdout && input.holdout.cases.some((item) => !existing.holdoutSceneIds.includes(item.sceneId))) throw new Error("CRAFT_EXPERIMENT_HOLDOUT_SCENE_MISMATCH");
  if (holdoutValidation?.status === "blocked") throw new Error("CRAFT_EXPERIMENT_HOLDOUT_BLOCKED");
  const judgmentBase = { evaluatorId: input.evaluatorId, evaluatorKind: input.evaluatorKind, winner: input.winner, hardGuardsPassed: input.hardGuardsPassed, authorReason: input.authorReason, judgedAt: new Date().toISOString() };
  const judgment: ExperimentJudgment = { ...judgmentBase, fingerprint: hash(judgmentBase) };
  const status: CraftExperimentStatus = input.hardGuardsPassed && input.winner !== "uncertain" ? "judged" : input.hardGuardsPassed ? "inconclusive" : "failed";
  const { fingerprint: _fingerprint, ...existingBase } = existing;
  const base = { ...existingBase, ...(holdoutValidation ? { holdoutValidation } : {}), status, judgment, updatedAt: new Date().toISOString() };
  const experiment: CraftExperiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experiment.experimentId), experiment);
  return experiment;
}

export async function recordCraftExperimentDecision(input: { root: string; experimentId: string; actor: string; decision: "adopt" | "reject"; reason: string }): Promise<CraftExperiment> {
  if (!input.actor.trim()) throw new Error("CRAFT_EXPERIMENT_DECISION_ACTOR_REQUIRED");
  if (!input.reason.trim()) throw new Error("CRAFT_EXPERIMENT_DECISION_REASON_REQUIRED");
  const existing = await readCraftExperiment(input.root, input.experimentId);
  if (!existing) throw new Error("CRAFT_EXPERIMENT_NOT_FOUND");
  if (existing.status !== "judged" && existing.status !== "failed" && existing.status !== "inconclusive") throw new Error("CRAFT_EXPERIMENT_DECISION_STATUS_INVALID");
  if (input.decision === "adopt" && (existing.status !== "judged" || existing.judgment?.winner !== "treatment" || !existing.judgment.hardGuardsPassed)) throw new Error("CRAFT_EXPERIMENT_DECISION_ADOPTION_BLOCKED");
  const { fingerprint: _fingerprint, ...existingBase } = existing;
  const base = { ...existingBase, decision: { actor: input.actor, decision: input.decision, reason: input.reason, decidedAt: new Date().toISOString() } };
  const experiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experiment.experimentId), experiment);
  return experiment;
}
