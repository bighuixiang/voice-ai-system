import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { CraftPattern } from "./craftPattern.js";
import { readRightsEnvelope } from "./sourceRights.js";

export interface SimilarityGuardResult {
  schemaVersion: "similarity-guard-result.v1";
  guardId: string;
  sourceVersion: string;
  targetVersion: string;
  overlapRatio: number;
  maxTokenOverlap: number;
  status: "passed" | "blocked";
  risk: "low" | "high";
  evidenceRefs: string[];
  createdAt: string;
  fingerprint: string;
}
export interface PatternTransferPlan {
  schemaVersion: "pattern-transfer-plan.v1";
  planId: string;
  projectSlug: string;
  patternId: string;
  sourceEnvelopeId: string;
  targetChapterId: string;
  intendedEffect: string;
  prohibitedActions: string[];
  guard: SimilarityGuardResult;
  status: "candidate" | "blocked" | "approved";
  canonWriteAllowed: false;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function planPath(root: string, planId: string): string { return resolveInside(root, `sessions/pattern-transfer-plans/${planId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(tmp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
function tokens(text: string): string[] { return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; }

export function evaluateSimilarityGuard(input: { sourceText: string; targetText: string; maxTokenOverlap: number; sourceVersion: string; targetVersion: string }): SimilarityGuardResult {
  if (!input.sourceVersion.trim() || !input.targetVersion.trim() || input.maxTokenOverlap < 0 || input.maxTokenOverlap > 1) throw new Error("SIMILARITY_GUARD_INPUT_INVALID");
  const sourceTokens = new Set(tokens(input.sourceText));
  const targetTokens = new Set(tokens(input.targetText));
  const overlap = sourceTokens.size ? [...sourceTokens].filter((token) => targetTokens.has(token)).length / sourceTokens.size : 0;
  const blocked = overlap > input.maxTokenOverlap;
  const base = { schemaVersion: "similarity-guard-result.v1" as const, guardId: `guard-${hash({ sourceVersion: input.sourceVersion, targetVersion: input.targetVersion, overlap }).slice(0, 16)}`, sourceVersion: input.sourceVersion, targetVersion: input.targetVersion, overlapRatio: Number(overlap.toFixed(6)), maxTokenOverlap: input.maxTokenOverlap, status: blocked ? "blocked" as const : "passed" as const, risk: blocked ? "high" as const : "low" as const, evidenceRefs: [`similarity://${input.sourceVersion}/${input.targetVersion}`], createdAt: new Date().toISOString() };
  return { ...base, fingerprint: hash(base) };
}

export async function readPatternTransferPlan(root: string, planId: string): Promise<PatternTransferPlan | null> { return readJson<PatternTransferPlan>(planPath(root, planId)); }

export async function createPatternTransferPlan(input: { root: string; projectSlug: string; pattern: CraftPattern; sourceEnvelopeId: string; guard: SimilarityGuardResult; targetChapterId: string; intendedEffect: string }): Promise<PatternTransferPlan> {
  if (input.pattern.projectSlug !== input.projectSlug || input.pattern.lifecycle !== "approved") throw new Error("PATTERN_TRANSFER_APPROVAL_REQUIRED");
  if (input.guard.status !== "passed") throw new Error("PATTERN_TRANSFER_SIMILARITY_BLOCKED");
  const envelope = await readRightsEnvelope(input.root, input.sourceEnvelopeId);
  if (!envelope || envelope.projectSlug !== input.projectSlug || envelope.status !== "valid" || envelope.analysisOnly || !envelope.allowedUses.includes("style-experiment")) throw new Error("PATTERN_TRANSFER_RIGHTS_BLOCKED");
  if (!input.targetChapterId.trim() || !input.intendedEffect.trim()) throw new Error("PATTERN_TRANSFER_METADATA_REQUIRED");
  const planId = `pattern-transfer-${input.projectSlug}-${hash({ patternId: input.pattern.patternId, targetChapterId: input.targetChapterId, guard: input.guard.fingerprint }).slice(0, 16)}`;
  const existing = await readPatternTransferPlan(input.root, planId);
  if (existing) return existing;
  const base = { schemaVersion: "pattern-transfer-plan.v1" as const, planId, projectSlug: input.projectSlug, patternId: input.pattern.patternId, sourceEnvelopeId: input.sourceEnvelopeId, targetChapterId: input.targetChapterId, intendedEffect: input.intendedEffect, prohibitedActions: ["copy-source-wording", "write-canon-directly", "expand-pattern-scope"], guard: input.guard, status: "candidate" as const, canonWriteAllowed: false as const, createdAt: new Date().toISOString() };
  const plan: PatternTransferPlan = { ...base, fingerprint: hash(base) };
  await writeJson(planPath(input.root, planId), plan);
  return plan;
}
