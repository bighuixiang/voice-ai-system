import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type MemoryPatchRisk = "low" | "medium" | "high";
export type MemoryPatchStatus = "candidate" | "ready" | "blocked";

export interface ChapterMemoryPatch {
  schemaVersion: "chapter-memory-patch.v1";
  patchId: string;
  chapterId: string;
  chapterVersion: string;
  sourceRefs: string[];
  summary: string;
  keyEvents: unknown[];
  newFacts: unknown[];
  characterStates: unknown[];
  emotionLedger: unknown[];
  foreshadowingActions: unknown[];
  continuityRisks: unknown[];
  growthChanges: unknown[];
  noChangeReason?: string;
  coverage: Record<MemoryPatchSurface, boolean>;
  risk: MemoryPatchRisk;
  status: "candidate";
  fingerprint: string;
}

export type MemoryPatchSurface = "summary" | "keyEvents" | "newFacts" | "characterStates" | "emotionLedger" | "foreshadowingActions" | "continuityRisks" | "growthChanges";

export interface ChapterAssetCoverage {
  schemaVersion: "chapter-asset-coverage.v1";
  chapterCount: number;
  assets: Record<"prose" | "summary" | "qualityReport" | "knowledgeIndex" | "foreshadowingExtraction", number>;
  coverageRate: Record<"prose" | "summary" | "qualityReport" | "knowledgeIndex" | "foreshadowingExtraction", number>;
  fingerprint: string;
}

const surfaces: MemoryPatchSurface[] = ["summary", "keyEvents", "newFacts", "characterStates", "emotionLedger", "foreshadowingActions", "continuityRisks", "growthChanges"];
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const patchPath = (root: string, patchId: string): string => resolveInside(root, `memory/chapter-patches/${patchId}.json`);
const riskRank: Record<MemoryPatchRisk, number> = { low: 1, medium: 2, high: 3 };

function itemRisk(item: unknown, surface: MemoryPatchSurface): MemoryPatchRisk {
  if (item && typeof item === "object" && "risk" in item && ((item as { risk?: unknown }).risk === "low" || (item as { risk?: unknown }).risk === "medium" || (item as { risk?: unknown }).risk === "high")) return (item as { risk: MemoryPatchRisk }).risk;
  if (surface === "foreshadowingActions" || surface === "continuityRisks") return "medium";
  if (surface === "characterStates" || surface === "growthChanges" || surface === "emotionLedger") return "medium";
  return "low";
}

export function createChapterMemoryPatch(input: {
  patchId: string;
  chapterId: string;
  chapterVersion: string;
  sourceRefs: string[];
  summary: string;
  keyEvents: unknown[];
  newFacts: unknown[];
  characterStates: unknown[];
  emotionLedger: unknown[];
  foreshadowingActions: unknown[];
  continuityRisks: unknown[];
  growthChanges: unknown[];
  noChangeReason?: string;
}): ChapterMemoryPatch {
  if (![input.patchId, input.chapterId, input.chapterVersion].every((value) => value.trim()) || !input.sourceRefs.length) throw new Error("MEMORY_PATCH_FIELDS_REQUIRED");
  for (const surface of surfaces.slice(1)) if (!Array.isArray(input[surface])) throw new Error("MEMORY_PATCH_SURFACE_REQUIRED");
  const empty = !input.summary.trim() && surfaces.slice(1).every((surface) => input[surface].length === 0);
  if (empty && !input.noChangeReason?.trim()) throw new Error("MEMORY_PATCH_NO_CHANGE_REASON_REQUIRED");
  const coverage = Object.fromEntries(surfaces.map((surface) => [surface, true])) as Record<MemoryPatchSurface, boolean>;
  const risks = surfaces.slice(1).flatMap((surface) => {
    const values = input[surface] as unknown[];
    return values.map((item: unknown) => itemRisk(item, surface));
  });
  const risk = risks.reduce<MemoryPatchRisk>((current, candidate) => riskRank[candidate] > riskRank[current] ? candidate : current, "low");
  const base = {
    schemaVersion: "chapter-memory-patch.v1" as const,
    patchId: input.patchId.trim(), chapterId: input.chapterId.trim(), chapterVersion: input.chapterVersion.trim(), sourceRefs: [...new Set(input.sourceRefs.map((ref) => ref.trim()).filter(Boolean))],
    summary: input.summary.trim(), keyEvents: input.keyEvents, newFacts: input.newFacts, characterStates: input.characterStates, emotionLedger: input.emotionLedger, foreshadowingActions: input.foreshadowingActions, continuityRisks: input.continuityRisks, growthChanges: input.growthChanges,
    ...(input.noChangeReason?.trim() ? { noChangeReason: input.noChangeReason.trim() } : {}), coverage, risk, status: "candidate" as const
  };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateMemoryPatchAdoption(patch: ChapterMemoryPatch, input: { mode: "auto" | "manual"; authorConfirmed: boolean }): { status: MemoryPatchStatus; requiredConfirmation: "none" | "author"; reason: string } {
  if (patch.risk === "high" && !input.authorConfirmed) return { status: "blocked", requiredConfirmation: "author", reason: "HIGH_RISK_MEMORY_PATCH_REQUIRES_AUTHOR_CONFIRMATION" };
  if (patch.risk === "medium" && input.mode === "manual" && !input.authorConfirmed) return { status: "blocked", requiredConfirmation: "author", reason: "MEDIUM_RISK_MEMORY_PATCH_REQUIRES_AUTHOR_CONFIRMATION" };
  return { status: "ready", requiredConfirmation: patch.risk === "high" || (patch.risk === "medium" && input.mode === "manual") ? "author" : "none", reason: "MEMORY_PATCH_ADOPTION_READY" };
}

async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

export async function persistChapterMemoryPatch(root: string, patch: ChapterMemoryPatch): Promise<ChapterMemoryPatch> {
  const existing = await readChapterMemoryPatch(root, patch.patchId);
  const { fingerprint: _fingerprint, ...base } = patch;
  if (existing) {
    const { fingerprint: _existingFingerprint, ...existingBase } = existing;
    if (hash(existingBase) !== hash(base)) throw new Error("MEMORY_PATCH_IMMUTABLE");
    return existing;
  }
  if (hash(base) !== patch.fingerprint) throw new Error("MEMORY_PATCH_INTEGRITY_FAILED");
  await writeJson(patchPath(root, patch.patchId), patch);
  return patch;
}

export function assertChapterMemoryPatchIntegrity(patch: ChapterMemoryPatch, expectedId?: string): ChapterMemoryPatch {
    const { fingerprint, ...base } = patch;
    const arraysValid = surfaces.slice(1).every((surface) => Array.isArray(patch[surface]));
    const coverageValid = patch.coverage && surfaces.every((surface) => patch.coverage[surface] === true);
    const empty = !patch.summary.trim() && surfaces.slice(1).every((surface) => patch[surface].length === 0);
    const valid = patch.schemaVersion === "chapter-memory-patch.v1" && (!expectedId || patch.patchId === expectedId) && [patch.patchId, patch.chapterId, patch.chapterVersion].every((value) => typeof value === "string" && value.trim()) && Array.isArray(patch.sourceRefs) && patch.sourceRefs.length > 0 && patch.sourceRefs.every((ref) => typeof ref === "string" && ref.trim()) && typeof patch.summary === "string" && arraysValid && coverageValid && ["low", "medium", "high"].includes(patch.risk) && patch.status === "candidate" && (!empty || Boolean(patch.noChangeReason?.trim())) && /^[a-f0-9]{64}$/i.test(patch.fingerprint) && hash(base) === fingerprint;
    if (!valid) throw new Error("MEMORY_PATCH_INTEGRITY_FAILED");
    return patch;
}

export async function readChapterMemoryPatch(root: string, patchId: string): Promise<ChapterMemoryPatch | null> {
  try {
    const patch = JSON.parse(await fs.readFile(patchPath(root, patchId), "utf8")) as ChapterMemoryPatch;
    return assertChapterMemoryPatchIntegrity(patch, patchId);
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export function calculateChapterAssetCoverage(chapters: Array<{ chapterId: string; prose: boolean; summary: boolean; qualityReport: boolean; knowledgeIndex: boolean; foreshadowingExtraction: boolean }>): ChapterAssetCoverage {
  const keys = ["prose", "summary", "qualityReport", "knowledgeIndex", "foreshadowingExtraction"] as const;
  const assets = Object.fromEntries(keys.map((key) => [key, chapters.filter((chapter) => chapter[key]).length])) as ChapterAssetCoverage["assets"];
  const coverageRate = Object.fromEntries(keys.map((key) => [key, chapters.length ? assets[key] / chapters.length : 0])) as ChapterAssetCoverage["coverageRate"];
  const base = { schemaVersion: "chapter-asset-coverage.v1" as const, chapterCount: chapters.length, assets, coverageRate };
  return { ...base, fingerprint: hash(base) };
}
