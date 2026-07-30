import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { AuthorFeedbackEvent } from "./authorFeedback.js";

export type FeedbackCategory = "content" | "structure" | "language" | "fact" | "presentation";
export type PreferenceLifecycle = "candidate" | "validated" | "active" | "weakened" | "retired";

export interface FeedbackAttribution {
  schemaVersion: "feedback-attribution.v1";
  attributionId: string;
  eventId: string;
  adoptionTransactionId: string;
  projectSlug: string;
  candidateId: string;
  category: FeedbackCategory;
  pattern: string;
  scope: { chapterId?: string; sceneId?: string };
  evidenceRefs: string[];
  confounders: string[];
  confidence: { lower: number; upper: number };
  allowPreferenceLearning: boolean;
  lifecycle: "candidate";
  createdAt: string;
  fingerprint: string;
}

export interface PreferenceHypothesis {
  schemaVersion: "preference-hypothesis.v1";
  hypothesisId: string;
  projectSlug: string;
  pattern: string;
  category: FeedbackCategory;
  scope: { chapterId?: string; sceneId?: string };
  lifecycle: PreferenceLifecycle;
  supportEventIds: string[];
  oppositionEventIds: string[];
  confidence: { lower: number; upper: number };
  minIndependentEvidence: 2;
  createdAt: string;
  updatedAt: string;
  revokeReason?: string;
  revokedBy?: string;
  revokedAt?: string;
  oppositionReasons?: string[];
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function attributionPath(root: string, id: string): string { return resolveInside(root, `sessions/feedback-attributions/${id}.json`); }
function hypothesisPath(root: string, id: string): string { return resolveInside(root, `sessions/preference-hypotheses/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, target);
}
async function readJson<T>(target: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(target, "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
async function listJson<T>(directory: string): Promise<T[]> {
  try {
    const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".json"));
    return Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(directory, file), "utf8")) as T));
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
}
function sameScope(left: FeedbackAttribution, right: FeedbackAttribution): boolean { return JSON.stringify(left.scope) === JSON.stringify(right.scope); }

export async function readFeedbackAttribution(root: string, attributionId: string): Promise<FeedbackAttribution | null> { return readJson<FeedbackAttribution>(attributionPath(root, attributionId)); }
export async function readPreferenceHypothesis(root: string, hypothesisId: string): Promise<PreferenceHypothesis | null> { return readJson<PreferenceHypothesis>(hypothesisPath(root, hypothesisId)); }

export async function createFeedbackAttribution(input: {
  root: string;
  event: AuthorFeedbackEvent;
  category: FeedbackCategory;
  pattern?: string;
  scope: { chapterId?: string; sceneId?: string };
  evidenceRefs: string[];
  confounders: string[];
  confidence: { lower: number; upper: number };
}): Promise<FeedbackAttribution> {
  if (!input.evidenceRefs.length) throw new Error("FEEDBACK_ATTRIBUTION_EVIDENCE_REQUIRED");
  if (input.confidence.lower < 0 || input.confidence.upper > 1 || input.confidence.lower > input.confidence.upper) throw new Error("FEEDBACK_ATTRIBUTION_CONFIDENCE_INVALID");
  const pattern = input.pattern || `${input.category}:${input.event.note.trim().toLowerCase() || input.event.decision}`;
  const base = {
    schemaVersion: "feedback-attribution.v1" as const,
    attributionId: `attribution-${input.event.eventId}-${hash({ pattern, scope: input.scope }).slice(0, 16)}`,
    eventId: input.event.eventId,
    adoptionTransactionId: input.event.adoptionTransactionId,
    projectSlug: input.event.projectSlug,
    candidateId: input.event.candidateId,
    category: input.category,
    pattern,
    scope: input.scope,
    evidenceRefs: [...input.evidenceRefs],
    confounders: [...input.confounders],
    confidence: input.confidence,
    allowPreferenceLearning: false,
    lifecycle: "candidate" as const,
    createdAt: new Date().toISOString()
  };
  const attribution: FeedbackAttribution = { ...base, fingerprint: hash(base) };
  const existing = await readFeedbackAttribution(input.root, attribution.attributionId);
  if (existing) return existing;
  await writeJson(attributionPath(input.root, attribution.attributionId), attribution);
  return attribution;
}

export async function derivePreferenceHypothesis(input: { root: string; attribution: FeedbackAttribution }): Promise<PreferenceHypothesis> {
  const all = (await listJson<FeedbackAttribution>(resolveInside(input.root, "sessions/feedback-attributions"))).filter((item) => item.projectSlug === input.attribution.projectSlug && item.pattern === input.attribution.pattern && item.category === input.attribution.category && sameScope(item, input.attribution) && item.allowPreferenceLearning === false);
  const distinctByAdoption = new Map<string, FeedbackAttribution>();
  for (const item of all) distinctByAdoption.set(item.adoptionTransactionId, item);
  const support = [...distinctByAdoption.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const confidenceLower = Math.max(...support.map((item) => item.confidence.lower), 0);
  const confidenceUpper = Math.min(...support.map((item) => item.confidence.upper), 1);
  const lifecycle: PreferenceLifecycle = support.length >= 2 ? "validated" : "candidate";
  const hypothesisId = `hypothesis-${input.attribution.projectSlug}-${hash({ pattern: input.attribution.pattern, category: input.attribution.category, scope: input.attribution.scope }).slice(0, 16)}`;
  const existing = await readPreferenceHypothesis(input.root, hypothesisId);
  if (existing && existing.lifecycle === "validated" && lifecycle === "candidate") return existing;
  const now = new Date().toISOString();
  const base = { schemaVersion: "preference-hypothesis.v1" as const, hypothesisId, projectSlug: input.attribution.projectSlug, pattern: input.attribution.pattern, category: input.attribution.category, scope: input.attribution.scope, lifecycle, supportEventIds: support.map((item) => item.eventId), oppositionEventIds: [], confidence: { lower: confidenceLower, upper: confidenceUpper }, minIndependentEvidence: 2 as const, createdAt: existing?.createdAt || now, updatedAt: now };
  const hypothesis: PreferenceHypothesis = { ...base, fingerprint: hash(base) };
  await writeJson(hypothesisPath(input.root, hypothesisId), hypothesis);
  return hypothesis;
}

export async function revokePreferenceHypothesis(input: { root: string; hypothesisId: string; actor: string; reason: string }): Promise<PreferenceHypothesis> {
  if (!input.reason.trim()) throw new Error("PREFERENCE_REVOCATION_REASON_REQUIRED");
  const existing = await readPreferenceHypothesis(input.root, input.hypothesisId);
  if (!existing) throw new Error("PREFERENCE_HYPOTHESIS_NOT_FOUND");
  if (existing.lifecycle === "retired") return existing;
  const base = { ...existing, lifecycle: "retired" as const, revokeReason: input.reason, revokedBy: input.actor, revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const result: PreferenceHypothesis = { ...base, fingerprint: hash(base) };
  await writeJson(hypothesisPath(input.root, result.hypothesisId), result);
  return result;
}

export async function recordPreferenceOpposition(input: { root: string; hypothesisId: string; oppositionEventId: string; reason: string }): Promise<PreferenceHypothesis> {
  if (!input.oppositionEventId.trim()) throw new Error("PREFERENCE_OPPOSITION_EVENT_REQUIRED");
  if (!input.reason.trim()) throw new Error("PREFERENCE_OPPOSITION_REASON_REQUIRED");
  const existing = await readPreferenceHypothesis(input.root, input.hypothesisId);
  if (!existing) throw new Error("PREFERENCE_HYPOTHESIS_NOT_FOUND");
  if (existing.oppositionEventIds.includes(input.oppositionEventId)) return existing;
  const base = { ...existing, lifecycle: existing.lifecycle === "retired" ? "retired" as const : "weakened" as const, oppositionEventIds: [...existing.oppositionEventIds, input.oppositionEventId], oppositionReasons: [...(existing.oppositionReasons || []), input.reason], updatedAt: new Date().toISOString() };
  const result: PreferenceHypothesis = { ...base, fingerprint: hash(base) };
  await writeJson(hypothesisPath(input.root, result.hypothesisId), result);
  return result;
}
