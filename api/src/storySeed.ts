import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type SeedFacetName = "protagonist" | "situation" | "desire" | "resistance" | "stakes" | "worldSignal" | "relationship" | "themeQuestion" | "experience" | "prohibition" | "creativeCommand" | "trauma";
export interface AuthorUtterance { schemaVersion: "author-utterance.v1"; utteranceId: string; projectId: string; text: string; idempotencyKey: string; status: "captured"; fingerprint: string; }
export interface EvidenceSpan { start: number; end: number; }
export interface SeedFacet { facet: SeedFacetName; value: string; certainty: "explicit" | "unknown"; evidence: EvidenceSpan[]; }
export interface StorySeedFrame { schemaVersion: "story-seed-frame.v1"; utterance: AuthorUtterance; facets: SeedFacet[]; fingerprint: string; }
export interface SeedInterpretationSet { schemaVersion: "seed-interpretation-set.v1"; frameFingerprint: string; commonFacets: SeedFacetName[]; interpretations: Array<{ interpretationId: string; differences: string[]; downstreamImpact: string[]; supports: string[]; contradictions: string[] }>; status: "unresolved" | "resolved"; fingerprint: string; }

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const makeId = (projectId: string, key: string) => `utterance-${hash({ projectId, key }).slice(0, 16)}`;
const utterancePath = (root: string) => resolveInside(root, "sessions/author-utterances.json");
const framePath = (root: string) => resolveInside(root, "sessions/story-seed-frames.json");
const interpretationPath = (root: string) => resolveInside(root, "sessions/seed-interpretation-sets.json");

export function assertAuthorUtteranceIntegrity(value: unknown, expectedProjectId?: string): asserts value is AuthorUtterance {
  if (!value || typeof value !== "object") throw new Error("AUTHOR_UTTERANCE_INTEGRITY_FAILED");
  const utterance = value as Record<string, unknown>;
  if (utterance.schemaVersion !== "author-utterance.v1" || typeof utterance.utteranceId !== "string" || !utterance.utteranceId.trim() || typeof utterance.projectId !== "string" || !utterance.projectId.trim() || (expectedProjectId && utterance.projectId !== expectedProjectId) || typeof utterance.text !== "string" || !utterance.text.trim() || typeof utterance.idempotencyKey !== "string" || !utterance.idempotencyKey.trim() || utterance.status !== "captured" || typeof utterance.fingerprint !== "string") throw new Error("AUTHOR_UTTERANCE_INTEGRITY_FAILED");
  const { fingerprint, ...base } = utterance;
  if (hash(base) !== fingerprint) throw new Error("AUTHOR_UTTERANCE_INTEGRITY_FAILED");
}

export function captureAuthorUtterance(input: { projectId: string; text: string; idempotencyKey: string }): AuthorUtterance {
  if (!input.projectId.trim() || !input.text.trim() || !input.idempotencyKey.trim()) throw new Error("AUTHOR_UTTERANCE_FIELDS_REQUIRED");
  const base = { schemaVersion: "author-utterance.v1" as const, utteranceId: makeId(input.projectId, input.idempotencyKey), projectId: input.projectId, text: input.text, idempotencyKey: input.idempotencyKey, status: "captured" as const };
  return { ...base, fingerprint: hash(base) };
}

export async function readAuthorUtterances(root: string, expectedProjectId?: string): Promise<AuthorUtterance[]> {
  let raw: string;
  try {
    raw = await fs.readFile(utterancePath(root), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("AUTHOR_UTTERANCE_INTEGRITY_FAILED"); }
  if (!Array.isArray(parsed)) throw new Error("AUTHOR_UTTERANCE_INTEGRITY_FAILED");
  for (const item of parsed) assertAuthorUtteranceIntegrity(item, expectedProjectId);
  return parsed as AuthorUtterance[];
}

export async function persistAuthorUtterance(root: string, utterance: AuthorUtterance): Promise<{ utterance: AuthorUtterance; created: boolean }> {
  assertAuthorUtteranceIntegrity(utterance);
  const current = await readAuthorUtterances(root, utterance.projectId);
  const existing = current.find((item) => item.idempotencyKey === utterance.idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== utterance.fingerprint) throw new Error("AUTHOR_UTTERANCE_IDEMPOTENCY_CONFLICT");
    return { utterance: existing, created: false };
  }
  const next = [...current, utterance];
  const target = utterancePath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { utterance, created: true };
}

export function buildStorySeedFrame(input: { utterance: AuthorUtterance; facets: ReadonlyArray<{ facet: SeedFacetName; value: string; evidence: readonly EvidenceSpan[] }> }): StorySeedFrame {
  for (const item of input.facets) {
    const value = item.value.trim();
    if (!value) throw new Error("SEED_FACET_VALUE_REQUIRED");
    const unknown = value.toLowerCase() === "unknown";
    if (!unknown && !item.evidence.length) throw new Error("SEED_EVIDENCE_REQUIRED");
    for (const span of item.evidence) if (span.start < 0 || span.end <= span.start || span.end > input.utterance.text.length) throw new Error("SEED_EVIDENCE_RANGE_INVALID");
  }
  const base = { schemaVersion: "story-seed-frame.v1" as const, utterance: { ...input.utterance }, facets: input.facets.map((item) => ({ facet: item.facet, value: item.value, certainty: item.value.toLowerCase() === "unknown" ? "unknown" as const : "explicit" as const, evidence: item.evidence.map((span) => ({ ...span })) })) };
  return { ...base, fingerprint: hash(base) };
}

export function assertStorySeedFrameIntegrity(value: unknown, expectedProjectId?: string): asserts value is StorySeedFrame {
  if (!value || typeof value !== "object") throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED");
  const frame = value as Record<string, unknown>;
  if (frame.schemaVersion !== "story-seed-frame.v1" || !Array.isArray(frame.facets) || typeof frame.fingerprint !== "string") throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED");
  try { assertAuthorUtteranceIntegrity(frame.utterance, expectedProjectId); } catch { throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED"); }
  const allowed = new Set<SeedFacetName>(["protagonist", "situation", "desire", "resistance", "stakes", "worldSignal", "relationship", "themeQuestion", "experience", "prohibition", "creativeCommand", "trauma"]);
  for (const item of frame.facets as Array<Record<string, unknown>>) {
    if (!item || !allowed.has(item.facet as SeedFacetName) || typeof item.value !== "string" || !item.value.trim() || (item.certainty !== "explicit" && item.certainty !== "unknown") || !Array.isArray(item.evidence)) throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED");
    if ((item.value.toLowerCase() === "unknown") !== (item.certainty === "unknown")) throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED");
    for (const span of item.evidence as Array<Record<string, unknown>>) if (!span || !Number.isInteger(span.start) || !Number.isInteger(span.end) || Number(span.start) < 0 || Number(span.end) <= Number(span.start) || Number(span.end) > (frame.utterance as AuthorUtterance).text.length) throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED");
  }
  const { fingerprint, ...base } = frame;
  if (hash(base) !== fingerprint) throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED");
}

export async function readStorySeedFrames(root: string, expectedProjectId?: string): Promise<StorySeedFrame[]> {
  let raw: string;
  try { raw = await fs.readFile(framePath(root), "utf8"); } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED"); }
  if (!Array.isArray(parsed)) throw new Error("STORY_SEED_FRAME_INTEGRITY_FAILED");
  for (const item of parsed) assertStorySeedFrameIntegrity(item, expectedProjectId);
  return parsed as StorySeedFrame[];
}

export async function persistStorySeedFrame(root: string, frame: StorySeedFrame): Promise<{ frame: StorySeedFrame; created: boolean }> {
  assertStorySeedFrameIntegrity(frame);
  const current = await readStorySeedFrames(root, frame.utterance.projectId);
  const existing = current.find((item) => item.utterance.utteranceId === frame.utterance.utteranceId);
  if (existing) {
    if (existing.fingerprint !== frame.fingerprint) throw new Error("STORY_SEED_FRAME_IDEMPOTENCY_CONFLICT");
    return { frame: existing, created: false };
  }
  const next = [...current, frame];
  const target = framePath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { frame, created: true };
}

export function createSeedInterpretationSet(input: { frame: StorySeedFrame; interpretations: ReadonlyArray<SeedInterpretationSet["interpretations"][number]> }): SeedInterpretationSet {
  if (input.interpretations.length < 2) throw new Error("SEED_INTERPRETATIONS_REQUIRED");
  for (const interpretation of input.interpretations) if (!interpretation.interpretationId.trim() || !interpretation.differences.length || !interpretation.downstreamImpact.length) throw new Error("SEED_INTERPRETATION_INVALID");
  const commonFacets = input.frame.facets.filter((facet) => input.interpretations.every((interpretation) => interpretation.supports.includes(facet.facet) || facet.certainty === "explicit")).map((facet) => facet.facet);
  const base = { schemaVersion: "seed-interpretation-set.v1" as const, frameFingerprint: input.frame.fingerprint, commonFacets: [...new Set(commonFacets)], interpretations: input.interpretations.map((interpretation) => ({ ...interpretation, differences: [...interpretation.differences], downstreamImpact: [...interpretation.downstreamImpact], supports: [...interpretation.supports], contradictions: [...interpretation.contradictions] })), status: "unresolved" as const };
  return { ...base, fingerprint: hash(base) };
}

export function assertSeedInterpretationSetIntegrity(value: unknown): asserts value is SeedInterpretationSet {
  if (!value || typeof value !== "object") throw new Error("SEED_INTERPRETATION_SET_INTEGRITY_FAILED");
  const set = value as Record<string, unknown>;
  const allowed = new Set<SeedFacetName>(["protagonist", "situation", "desire", "resistance", "stakes", "worldSignal", "relationship", "themeQuestion", "experience", "prohibition", "creativeCommand", "trauma"]);
  if (set.schemaVersion !== "seed-interpretation-set.v1" || typeof set.frameFingerprint !== "string" || !set.frameFingerprint.trim() || !Array.isArray(set.commonFacets) || set.commonFacets.some((facet) => !allowed.has(facet as SeedFacetName)) || !Array.isArray(set.interpretations) || set.interpretations.length < 2 || (set.status !== "unresolved" && set.status !== "resolved") || typeof set.fingerprint !== "string") throw new Error("SEED_INTERPRETATION_SET_INTEGRITY_FAILED");
  for (const interpretation of set.interpretations as Array<Record<string, unknown>>) {
    if (!interpretation || typeof interpretation.interpretationId !== "string" || !interpretation.interpretationId.trim() || !Array.isArray(interpretation.differences) || !interpretation.differences.length || !Array.isArray(interpretation.downstreamImpact) || !interpretation.downstreamImpact.length || !Array.isArray(interpretation.supports) || !Array.isArray(interpretation.contradictions) || [...interpretation.differences, ...interpretation.downstreamImpact, ...interpretation.supports, ...interpretation.contradictions].some((item) => typeof item !== "string" || !item.trim())) throw new Error("SEED_INTERPRETATION_SET_INTEGRITY_FAILED");
  }
  const { fingerprint, ...base } = set;
  if (hash(base) !== fingerprint) throw new Error("SEED_INTERPRETATION_SET_INTEGRITY_FAILED");
}

export async function readSeedInterpretationSets(root: string, _expectedProjectId?: string): Promise<SeedInterpretationSet[]> {
  let raw: string;
  try { raw = await fs.readFile(interpretationPath(root), "utf8"); } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("SEED_INTERPRETATION_SET_INTEGRITY_FAILED"); }
  if (!Array.isArray(parsed)) throw new Error("SEED_INTERPRETATION_SET_INTEGRITY_FAILED");
  for (const item of parsed) assertSeedInterpretationSetIntegrity(item);
  return parsed as SeedInterpretationSet[];
}

export async function persistSeedInterpretationSet(root: string, set: SeedInterpretationSet): Promise<{ set: SeedInterpretationSet; created: boolean }> {
  assertSeedInterpretationSetIntegrity(set);
  const current = await readSeedInterpretationSets(root);
  const existing = current.find((item) => item.frameFingerprint === set.frameFingerprint);
  if (existing) {
    if (existing.fingerprint !== set.fingerprint) throw new Error("SEED_INTERPRETATION_SET_IDEMPOTENCY_CONFLICT");
    return { set: existing, created: false };
  }
  const next = [...current, set];
  const target = interpretationPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { set, created: true };
}
