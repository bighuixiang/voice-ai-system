import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface RunPreflight {
  schemaVersion: "run-preflight.v1";
  runId: string;
  objective: string;
  estimatedWorkItems: number;
  estimatedWallClockMs: number;
  estimatedCostCents: number;
  missingAssets: string[];
  pausePoints: string[];
  authorizationScope: string;
  worstCaseRecoveryBoundary: string;
  limits: RunExecutionLimits;
  status: "ready" | "blocked";
  blockedReasons: string[];
  fingerprint: string;
}
export interface RunExecutionLimits {
  maxChapters: number;
  maxWorkItems: number;
  maxActiveWorkItems: number;
  maxModelCalls: number;
  maxCostCents: number;
  maxWallClockMs: number;
  maxConsecutiveFailures: number;
  latestStopAt?: string;
}
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateRunPreflight(input: { runId: string; objective: string; estimatedWorkItems: number; estimatedWallClockMs: number; estimatedCostCents: number; missingAssets: string[]; pausePoints: string[]; authorizationScope: string; worstCaseRecoveryBoundary: string; storyContractConfirmed: boolean; migrationComplete: boolean; budgetAvailable: boolean; workerOnline: boolean; conflictingRun: boolean; estimatedChapters?: number; limits?: Partial<RunExecutionLimits> }): RunPreflight {
  if (!input.runId.trim() || !input.objective.trim() || !input.authorizationScope.trim() || !input.worstCaseRecoveryBoundary.trim() || ![input.estimatedWorkItems, input.estimatedWallClockMs, input.estimatedCostCents].every((value) => Number.isFinite(value) && value >= 0) || !Number.isInteger(input.estimatedWorkItems) || input.pausePoints.some((point) => !point.trim()) || input.missingAssets.some((asset) => !asset.trim())) throw new Error("RUN_PREFLIGHT_INPUT_INVALID");
  const limits: RunExecutionLimits = {
    maxChapters: input.limits?.maxChapters ?? Math.max(1, input.estimatedChapters ?? input.estimatedWorkItems),
    maxWorkItems: input.limits?.maxWorkItems ?? Math.max(1, input.estimatedWorkItems),
    maxActiveWorkItems: input.limits?.maxActiveWorkItems ?? Math.max(1, input.estimatedWorkItems),
    maxModelCalls: input.limits?.maxModelCalls ?? Math.max(1, input.estimatedWorkItems),
    maxCostCents: input.limits?.maxCostCents ?? Math.max(1, input.estimatedCostCents),
    maxWallClockMs: input.limits?.maxWallClockMs ?? Math.max(1, input.estimatedWallClockMs),
    maxConsecutiveFailures: input.limits?.maxConsecutiveFailures ?? 3,
    ...(input.limits?.latestStopAt ? { latestStopAt: input.limits.latestStopAt } : {})
  };
  const numericLimits = [limits.maxChapters, limits.maxWorkItems, limits.maxActiveWorkItems, limits.maxModelCalls, limits.maxCostCents, limits.maxWallClockMs, limits.maxConsecutiveFailures];
  if (numericLimits.some((value) => !Number.isFinite(value) || value <= 0) || numericLimits.some((value) => !Number.isInteger(value)) || (limits.latestStopAt !== undefined && !Number.isFinite(Date.parse(limits.latestStopAt)))) throw new Error("RUN_PREFLIGHT_LIMITS_INVALID");
  const blockedReasons: string[] = [];
  if (!input.storyContractConfirmed) blockedReasons.push("STORY_CONTRACT_UNCONFIRMED");
  if (!input.migrationComplete) blockedReasons.push("MIGRATION_INCOMPLETE");
  if (!input.budgetAvailable) blockedReasons.push("BUDGET_INSUFFICIENT");
  if (!input.workerOnline) blockedReasons.push("WORKER_OFFLINE");
  if (input.conflictingRun) blockedReasons.push("CONFLICTING_RUN");
  if (input.missingAssets.length) blockedReasons.push("MISSING_ASSETS");
  const estimatedChapters = input.estimatedChapters ?? input.estimatedWorkItems;
  if (estimatedChapters > limits.maxChapters) blockedReasons.push("CHAPTER_ESTIMATE_EXCEEDS_LIMIT");
  if (input.estimatedWorkItems > limits.maxWorkItems) blockedReasons.push("WORK_ITEM_ESTIMATE_EXCEEDS_LIMIT");
  if (input.estimatedWallClockMs > limits.maxWallClockMs) blockedReasons.push("WALL_CLOCK_ESTIMATE_EXCEEDS_LIMIT");
  if (input.estimatedCostCents > limits.maxCostCents) blockedReasons.push("COST_ESTIMATE_EXCEEDS_LIMIT");
  if (limits.latestStopAt && Date.now() >= Date.parse(limits.latestStopAt)) blockedReasons.push("LATEST_STOP_TIME_EXPIRED");
  const base = { schemaVersion: "run-preflight.v1" as const, runId: input.runId.trim(), objective: input.objective.trim(), estimatedWorkItems: input.estimatedWorkItems, estimatedWallClockMs: input.estimatedWallClockMs, estimatedCostCents: input.estimatedCostCents, missingAssets: [...input.missingAssets], pausePoints: [...input.pausePoints], authorizationScope: input.authorizationScope.trim(), worstCaseRecoveryBoundary: input.worstCaseRecoveryBoundary.trim(), limits, status: blockedReasons.length ? "blocked" as const : "ready" as const, blockedReasons: [...new Set(blockedReasons)] };
  return { ...base, fingerprint: hash(base) };
}

function preflightPath(root: string, runId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) throw new Error("RUN_PREFLIGHT_ID_INVALID");
  return resolveInside(root, path.join("sessions", "book-runs", `${runId}.preflight.json`));
}

export function assertRunPreflightIntegrity(preflight: RunPreflight): RunPreflight {
  const { fingerprint: _fingerprint, ...base } = preflight;
  if (preflight.schemaVersion !== "run-preflight.v1" || !preflight.runId.trim() || !preflight.objective.trim() || !preflight.authorizationScope.trim() || !preflight.worstCaseRecoveryBoundary.trim() || !["ready", "blocked"].includes(preflight.status) || !Array.isArray(preflight.blockedReasons) || !/^[a-f0-9]{64}$/i.test(preflight.fingerprint) || hash(base) !== preflight.fingerprint) throw new Error("RUN_PREFLIGHT_INTEGRITY_FAILED");
  return preflight;
}

export async function readRunPreflight(root: string, runId: string): Promise<RunPreflight | null> {
  try { return assertRunPreflightIntegrity(JSON.parse(await fs.readFile(preflightPath(root, runId), "utf8")) as RunPreflight); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistRunPreflight(root: string, preflight: RunPreflight): Promise<{ created: boolean; preflight: RunPreflight }> {
  assertRunPreflightIntegrity(preflight);
  const target = preflightPath(root, preflight.runId);
  const existing = await readRunPreflight(root, preflight.runId);
  if (existing) {
    if (existing.fingerprint === preflight.fingerprint) return { created: false, preflight: existing };
    throw new Error("RUN_PREFLIGHT_IMMUTABLE");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { created: true, preflight };
}
