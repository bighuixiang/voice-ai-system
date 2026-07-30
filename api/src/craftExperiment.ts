import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { PatternTransferPlan } from "./patternTransfer.js";

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
  budgetId: string;
  status: CraftExperimentStatus;
  runnerId?: string;
  judgment?: ExperimentJudgment;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function experimentPath(root: string, id: string): string { return resolveInside(root, `sessions/craft-experiments/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(tmp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

export async function readCraftExperiment(root: string, experimentId: string): Promise<CraftExperiment | null> { return readJson<CraftExperiment>(experimentPath(root, experimentId)); }

export async function listCraftExperiments(root: string, projectSlug: string): Promise<CraftExperiment[]> {
  const directory = resolveInside(root, "sessions/craft-experiments");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<CraftExperiment>(path.join(directory, name))));
  return records.filter((record): record is CraftExperiment => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createCraftExperiment(input: { root: string; projectSlug: string; transferPlan: PatternTransferPlan; baselineCandidateId: string; treatmentCandidateId: string; holdoutSceneIds: readonly string[]; targetMetrics: readonly string[]; budgetId: string }): Promise<CraftExperiment> {
  if (input.transferPlan.projectSlug !== input.projectSlug || input.transferPlan.status !== "candidate" || input.transferPlan.canonWriteAllowed) throw new Error("CRAFT_EXPERIMENT_TRANSFER_PLAN_INVALID");
  if (!input.holdoutSceneIds.length) throw new Error("CRAFT_EXPERIMENT_HOLDOUT_REQUIRED");
  if (!input.targetMetrics.length || !input.baselineCandidateId.trim() || !input.treatmentCandidateId.trim() || !input.budgetId.trim()) throw new Error("CRAFT_EXPERIMENT_METADATA_REQUIRED");
  const experimentId = `craft-experiment-${input.projectSlug}-${hash({ plan: input.transferPlan.planId, baseline: input.baselineCandidateId, treatment: input.treatmentCandidateId, holdout: input.holdoutSceneIds }).slice(0, 16)}`;
  const existing = await readCraftExperiment(input.root, experimentId);
  if (existing) return existing;
  const base = { schemaVersion: "craft-experiment.v1" as const, experimentId, projectSlug: input.projectSlug, transferPlanId: input.transferPlan.planId, baselineCandidateId: input.baselineCandidateId, treatmentCandidateId: input.treatmentCandidateId, holdoutSceneIds: [...input.holdoutSceneIds], targetMetrics: [...input.targetMetrics], budgetId: input.budgetId, status: "planned" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const experiment: CraftExperiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experimentId), experiment);
  return experiment;
}

export async function startCraftExperiment(input: { root: string; experimentId: string; runnerId: string }): Promise<CraftExperiment> {
  if (!input.runnerId.trim()) throw new Error("CRAFT_EXPERIMENT_RUNNER_REQUIRED");
  const existing = await readCraftExperiment(input.root, input.experimentId);
  if (!existing) throw new Error("CRAFT_EXPERIMENT_NOT_FOUND");
  if (existing.status !== "planned") return existing;
  const base = { ...existing, status: "running" as const, runnerId: input.runnerId, updatedAt: new Date().toISOString() };
  const experiment: CraftExperiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experiment.experimentId), experiment);
  return experiment;
}

export async function judgeCraftExperiment(input: { root: string; experimentId: string; evaluatorId: string; evaluatorKind: ExperimentJudgment["evaluatorKind"]; winner: ExperimentJudgment["winner"]; hardGuardsPassed: boolean; authorReason: string }): Promise<CraftExperiment> {
  const existing = await readCraftExperiment(input.root, input.experimentId);
  if (!existing) throw new Error("CRAFT_EXPERIMENT_NOT_FOUND");
  if (existing.status !== "running") throw new Error("CRAFT_EXPERIMENT_NOT_RUNNING");
  if (!input.evaluatorId.trim() || input.evaluatorId === existing.runnerId || input.evaluatorKind !== "independent-reviewer") throw new Error("CRAFT_EXPERIMENT_EVALUATOR_NOT_INDEPENDENT");
  if (!input.authorReason.trim()) throw new Error("CRAFT_EXPERIMENT_JUDGMENT_REASON_REQUIRED");
  const judgmentBase = { evaluatorId: input.evaluatorId, evaluatorKind: input.evaluatorKind, winner: input.winner, hardGuardsPassed: input.hardGuardsPassed, authorReason: input.authorReason, judgedAt: new Date().toISOString() };
  const judgment: ExperimentJudgment = { ...judgmentBase, fingerprint: hash(judgmentBase) };
  const status: CraftExperimentStatus = input.hardGuardsPassed && input.winner !== "uncertain" ? "judged" : input.hardGuardsPassed ? "inconclusive" : "failed";
  const base = { ...existing, status, judgment, updatedAt: new Date().toISOString() };
  const experiment: CraftExperiment = { ...base, fingerprint: hash(base) };
  await writeJson(experimentPath(input.root, experiment.experimentId), experiment);
  return experiment;
}
