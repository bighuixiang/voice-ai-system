import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NovelProject } from "./types.js";
import { resolveInside } from "./pathSafety.js";
import { listNarrativeObligations, type NarrativeObligation } from "./narrativeObligation.js";

export type LengthMode = "hard" | "soft" | "unknown";
export type LengthDimension = { mode: LengthMode; min?: number; max?: number; exact?: number };

export interface LengthContract {
  schemaVersion: "length-contract.v1";
  projectSlug: string;
  dimensions: { totalWords: LengthDimension; totalChapters: LengthDimension; totalVolumes: LengthDimension; chapterWords: LengthDimension };
  pauseThresholdRatio: 0.15;
  hardLocks: string[];
  source: "author";
  effectiveScope: "project";
  revisionLineage: string[];
  createdAt: string;
  fingerprint: string;
}

export interface LengthForecast {
  schemaVersion: "length-forecast.v1";
  projectSlug: string;
  contractFingerprint: string;
  actuals: { totalWords: number; totalChapters: number; totalVolumes: number; chapterWords: number[] };
  obligationSummary: { total: number; open: number; highImportanceOpen: number; terminal: number; sourceFingerprint: string };
  completionRange: { totalWords: { min: number; max: number }; totalChapters: { min: number; max: number }; totalVolumes: { min: number; max: number } };
  confidence: "low" | "medium" | "high";
  assumptions: string[];
  bestPath: string;
  worstPath: string;
  endingReachability: "reachable" | "at-risk" | "blocked";
  frozenBaseline: string;
  status: "within-range" | "pause-required";
  blockingReasons: string[];
  createdAt: string;
  fingerprint: string;
}

export interface LengthVarianceDecision {
  schemaVersion: "length-variance-decision.v1";
  decisionId: string;
  projectSlug: string;
  contractFingerprint: string;
  forecastFingerprint: string;
  detectedDeviation: string[];
  cause: "forecast-drift" | "hard-lock-conflict" | "external-constraint" | "none";
  affectedOutlineIds: string[];
  affectedObligationIds: string[];
  alternatives: Array<{ optionId: string; label: string; autoAdoptable: false }>;
  authority: "author" | "external";
  choice: "pause-and-review" | "keep-plan" | "request-replan";
  status: "paused" | "recorded";
  createdAt: string;
  fingerprint: string;
}

const contractPath = (root: string) => resolveInside(root, "planning/length-contract.json");
const forecastPath = (root: string) => resolveInside(root, "planning/length-forecast.json");
const variancePath = (root: string, id: string) => resolveInside(root, `planning/length-variance/${id}.json`);
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function verifyFingerprint(value: { fingerprint?: unknown }): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = value as Record<string, unknown>;
  return hash(base) === value.fingerprint;
}

function verifyForecastFingerprint(value: LengthForecast): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, createdAt: _createdAt, ...stable } = value;
  return hash(stable) === value.fingerprint;
}

export function assertLengthContractIntegrity(contract: LengthContract): LengthContract {
  const validDimension = (dimension: LengthDimension) => {
    if (!dimension || !["hard", "soft", "unknown"].includes(dimension.mode)) return false;
    if (dimension.mode === "unknown") return dimension.min === undefined && dimension.max === undefined && dimension.exact === undefined;
    const values = [dimension.min, dimension.max, dimension.exact].filter((value) => value !== undefined);
    return values.every((value) => Number.isFinite(value) && (value as number) >= 0) && (dimension.min === undefined || dimension.max === undefined || dimension.max >= dimension.min) && (dimension.exact === undefined || (dimension.min === undefined || dimension.exact >= dimension.min) && (dimension.max === undefined || dimension.exact <= dimension.max));
  };
  const { fingerprint: _fingerprint, ...base } = contract;
  const valid = contract.schemaVersion === "length-contract.v1" && contract.projectSlug.trim() && Object.values(contract.dimensions).every(validDimension) && contract.pauseThresholdRatio >= 0 && contract.pauseThresholdRatio <= 1 && Array.isArray(contract.hardLocks) && contract.hardLocks.every((key) => ["totalWords", "totalChapters", "totalVolumes", "chapterWords"].includes(key)) && contract.hardLocks.every((key) => contract.dimensions[key as keyof typeof contract.dimensions].mode === "hard") && contract.source === "author" && contract.effectiveScope === "project" && Array.isArray(contract.revisionLineage) && contract.revisionLineage.every((value) => value.trim()) && !Number.isNaN(Date.parse(contract.createdAt)) && /^[a-f0-9]{64}$/i.test(contract.fingerprint) && hash(base) === contract.fingerprint;
  if (!valid) throw new Error("LENGTH_CONTRACT_INTEGRITY_FAILED");
  return contract;
}

async function writeJson(target: string, value: unknown) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

function normalizeDimension(value: unknown, key: string): LengthDimension {
  if (!value || typeof value !== "object") return { mode: "unknown" };
  const input = value as Record<string, unknown>;
  const mode = input.mode === "hard" || input.mode === "soft" || input.mode === "unknown" ? input.mode : "unknown";
  if (mode === "unknown") return { mode };
  const exact = Number.isFinite(input.exact) ? Number(input.exact) : undefined;
  const min = Number.isFinite(input.min) ? Number(input.min) : exact;
  const max = Number.isFinite(input.max) ? Number(input.max) : exact;
  if (min === undefined || max === undefined || min < 0 || max < min) throw new Error(`LENGTH_${key.toUpperCase()}_RANGE_INVALID`);
  return exact !== undefined ? { mode, exact, min, max } : { mode, min, max };
}

export async function createLengthContract(root: string, projectSlug: string, input: { dimensions: Record<string, unknown>; hardLocks?: string[] }): Promise<LengthContract> {
  const dimensions = {
    totalWords: normalizeDimension(input.dimensions.totalWords, "total_words"),
    totalChapters: normalizeDimension(input.dimensions.totalChapters, "total_chapters"),
    totalVolumes: normalizeDimension(input.dimensions.totalVolumes, "total_volumes"),
    chapterWords: normalizeDimension(input.dimensions.chapterWords, "chapter_words")
  };
  const hardLocks = (input.hardLocks || []).filter((key) => key in dimensions);
  for (const key of hardLocks) if (dimensions[key as keyof typeof dimensions].mode !== "hard") throw new Error(`LENGTH_HARD_LOCK_REQUIRES_HARD_${key}`);
  const base = { schemaVersion: "length-contract.v1" as const, projectSlug, dimensions, pauseThresholdRatio: 0.15 as const, hardLocks, source: "author" as const, effectiveScope: "project" as const, revisionLineage: [], createdAt: new Date().toISOString() };
  const contract = { ...base, fingerprint: hash(base) };
  await writeJson(contractPath(root), contract);
  return contract;
}

export async function readLengthContract(root: string): Promise<LengthContract | null> {
  try {
    const contract = JSON.parse(await fs.readFile(contractPath(root), "utf8")) as LengthContract;
    return assertLengthContractIntegrity(contract);
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function readLengthForecast(root: string): Promise<LengthForecast | null> {
  try {
    const forecast = JSON.parse(await fs.readFile(forecastPath(root), "utf8")) as LengthForecast;
    if (!verifyForecastFingerprint(forecast) || forecast.schemaVersion !== "length-forecast.v1") throw new Error("LENGTH_FORECAST_INTEGRITY_FAILED");
    return forecast;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

function bounds(dimension: LengthDimension, fallback: number): { min: number; max: number } {
  if (dimension.mode === "unknown") return { min: fallback, max: fallback };
  if (dimension.exact !== undefined) return { min: dimension.exact, max: dimension.exact };
  return { min: dimension.min ?? fallback, max: dimension.max ?? fallback };
}

function isTerminal(obligation: NarrativeObligation): boolean {
  return ["paid", "neutralized", "transformed", "waived", "invalidated", "merged"].includes(obligation.status);
}

export async function buildLengthForecast(root: string, project: NovelProject, contract: LengthContract): Promise<LengthForecast> {
  const chapterWords: number[] = [];
  for (const chapter of project.chapters) {
    try { chapterWords.push((await fs.readFile(resolveInside(root, chapter.contentPath), "utf8")).replace(/\s+/g, "").length); }
    catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") chapterWords.push(0); else throw error; }
  }
  const totalWords = chapterWords.reduce((sum, count) => sum + count, 0);
  const totalChapters = project.chapters.length;
  const totalVolumes = new Set(project.chapters.map((chapter) => chapter.volumeId).filter(Boolean)).size || 1;
  const actuals = { totalWords, totalChapters, totalVolumes, chapterWords };
  const obligations = await listNarrativeObligations(root);
  const openObligations = obligations.filter((obligation) => !isTerminal(obligation));
  const highImportanceOpen = openObligations.filter((obligation) => obligation.importance === "high").length;
  const obligationSummary = { total: obligations.length, open: openObligations.length, highImportanceOpen, terminal: obligations.length - openObligations.length, sourceFingerprint: hash(obligations.map((obligation) => ({ id: obligation.obligationId, status: obligation.status, version: obligation.version, fingerprint: obligation.fingerprint }))) };
  const chapterBounds = bounds(contract.dimensions.chapterWords, chapterWords.length ? Math.max(...chapterWords) : 1);
  const obligationWordFloor = totalWords + openObligations.length * chapterBounds.min;
  const obligationWordCeiling = totalWords + openObligations.length * chapterBounds.max;
  const baseWordRange = bounds(contract.dimensions.totalWords, totalWords);
  const baseChapterRange = bounds(contract.dimensions.totalChapters, totalChapters);
  const completionRange = {
    totalWords: { min: Math.max(baseWordRange.min, obligationWordFloor), max: Math.max(baseWordRange.max, obligationWordCeiling) },
    totalChapters: { min: Math.max(baseChapterRange.min, totalChapters + (openObligations.length ? 1 : 0)), max: Math.max(baseChapterRange.max, totalChapters + openObligations.length) },
    totalVolumes: bounds(contract.dimensions.totalVolumes, totalVolumes)
  };
  const blockingReasons: string[] = [];
  for (const [key, actual] of [["totalWords", totalWords], ["totalChapters", totalChapters], ["totalVolumes", totalVolumes]] as const) {
    const dimension = contract.dimensions[key];
    if (dimension.mode === "hard" && (actual < (dimension.min ?? dimension.exact ?? actual) || actual > (dimension.max ?? dimension.exact ?? actual))) blockingReasons.push(`hard-lock-${key}`);
    if (dimension.mode === "soft" && (actual < (dimension.min ?? actual) || actual > (dimension.max ?? actual))) blockingReasons.push(`soft-range-${key}`);
  }
  const totalWordsTarget = (completionRange.totalWords.min + completionRange.totalWords.max) / 2;
  if (totalWordsTarget > 0 && Math.abs(totalWords - totalWordsTarget) / totalWordsTarget > contract.pauseThresholdRatio) blockingReasons.push("forecast-deviation-over-15pct");
  if (openObligations.length && obligationWordFloor > baseWordRange.max) blockingReasons.push("open-obligations-outside-range");
  const base = { schemaVersion: "length-forecast.v1" as const, projectSlug: project.slug, contractFingerprint: contract.fingerprint, actuals, obligationSummary, completionRange, confidence: openObligations.length > 0 ? "low" as const : "medium" as const, assumptions: ["Forecast counts non-whitespace characters as draft words.", "Each open obligation reserves at least one chapter-word minimum and at most one chapter-word maximum; obligations remain authoritative over count.", "No filler, silent compression, or automatic chapter creation is permitted."], bestPath: "Complete remaining obligations within the accepted soft range.", worstPath: "Pause before filler, forced compression, or a hard-lock breach.", endingReachability: blockingReasons.some((reason) => reason.startsWith("hard-lock")) ? "blocked" as const : blockingReasons.length ? "at-risk" as const : "reachable" as const, frozenBaseline: contract.fingerprint, status: blockingReasons.length ? "pause-required" as const : "within-range" as const, blockingReasons, createdAt: new Date().toISOString() };
  const { createdAt: _createdAt, ...stableBase } = base;
  const forecast = { ...base, fingerprint: hash(stableBase) };
  await writeJson(forecastPath(root), forecast);
  return forecast;
}

export async function readLengthVarianceDecision(root: string, decisionId: string): Promise<LengthVarianceDecision | null> {
  try {
    const decision = JSON.parse(await fs.readFile(variancePath(root, decisionId), "utf8")) as LengthVarianceDecision;
    if (!verifyFingerprint(decision) || decision.schemaVersion !== "length-variance-decision.v1" || decision.decisionId !== decisionId) throw new Error("LENGTH_VARIANCE_INTEGRITY_FAILED");
    return decision;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function decideLengthVariance(root: string, contract: LengthContract, forecast: LengthForecast, input: { authority: "author" | "external"; choice: LengthVarianceDecision["choice"] }): Promise<LengthVarianceDecision> {
  if (!verifyFingerprint(contract)) throw new Error("LENGTH_CONTRACT_INTEGRITY_FAILED");
  if (!verifyForecastFingerprint(forecast) || forecast.schemaVersion !== "length-forecast.v1" || forecast.projectSlug !== contract.projectSlug || forecast.contractFingerprint !== contract.fingerprint) throw new Error("LENGTH_FORECAST_INTEGRITY_MISMATCH");
  const base = { schemaVersion: "length-variance-decision.v1" as const, decisionId: `length-variance-${forecast.fingerprint.slice(0, 12)}`, projectSlug: contract.projectSlug, contractFingerprint: contract.fingerprint, forecastFingerprint: forecast.fingerprint, detectedDeviation: forecast.blockingReasons, cause: forecast.blockingReasons.some((reason) => reason.startsWith("hard-lock")) ? "hard-lock-conflict" as const : forecast.blockingReasons.length ? "forecast-drift" as const : "none" as const, affectedOutlineIds: [], affectedObligationIds: [], alternatives: [{ optionId: "keep-plan", label: "保留当前计划并继续观察", autoAdoptable: false as const }, { optionId: "replan", label: "只重规划受影响远期窗口", autoAdoptable: false as const }, { optionId: "pause", label: "暂停并请求作者决策", autoAdoptable: false as const }], authority: input.authority, choice: input.choice, status: input.choice === "pause-and-review" || forecast.status === "pause-required" ? "paused" as const : "recorded" as const, createdAt: new Date().toISOString() };
  const decision = { ...base, fingerprint: hash(base) };
  const existing = await readLengthVarianceDecision(root, decision.decisionId);
  if (existing) {
    if (existing.contractFingerprint !== contract.fingerprint || existing.forecastFingerprint !== forecast.fingerprint) throw new Error("LENGTH_VARIANCE_DECISION_CONFLICT");
    return existing;
  }
  await writeJson(variancePath(root, decision.decisionId), decision);
  return decision;
}
