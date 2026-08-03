import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type KnowledgeState = "learned" | "forgotten" | "misbelieved" | "challenged" | "seen" | "inferable" | "reinterpreted";
export interface CharacterKnowledgeState {
  schemaVersion: "character-knowledge-state.v1";
  stateId: string;
  characterId: string;
  claimId: string;
  state: KnowledgeState;
  evidenceRefs: string[];
  asOfEvent: string;
  fingerprint: string;
}
export interface ReaderKnowledgeState {
  schemaVersion: "reader-knowledge-state.v1";
  stateId: string;
  readerScope: string;
  claimId: string;
  state: Extract<KnowledgeState, "seen" | "inferable" | "reinterpreted">;
  publicationVersion: string;
  progressCursor: string;
  evidenceRefs: string[];
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createCharacterKnowledgeState(input: Omit<CharacterKnowledgeState, "schemaVersion" | "stateId" | "fingerprint">): CharacterKnowledgeState {
  if (!input.characterId.trim() || !input.claimId.trim() || !input.asOfEvent.trim() || !input.evidenceRefs.length) throw new Error("CHARACTER_KNOWLEDGE_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "character-knowledge-state.v1" as const, stateId: `character-knowledge-${crypto.randomUUID()}`, ...input, evidenceRefs: [...new Set(input.evidenceRefs)] };
  return { ...base, fingerprint: hash(base) };
}

export function createReaderKnowledgeState(input: Omit<ReaderKnowledgeState, "schemaVersion" | "stateId" | "fingerprint">): ReaderKnowledgeState {
  if (!input.readerScope.trim() || !input.claimId.trim() || !input.publicationVersion.trim() || !input.progressCursor.trim() || !input.evidenceRefs.length) throw new Error("READER_KNOWLEDGE_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "reader-knowledge-state.v1" as const, stateId: `reader-knowledge-${crypto.randomUUID()}`, ...input, evidenceRefs: [...new Set(input.evidenceRefs)] };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateCharacterKnowledge(input: { states: CharacterKnowledgeState[]; characterId: string; claimId: string; targetEvent: string; eventOrder: Record<string, number> }): { eligible: boolean; reason: string } {
  const target = input.eventOrder[input.targetEvent];
  if (target === undefined) return { eligible: false, reason: "TARGET_EVENT_UNKNOWN" };
  const states = input.states.filter((state) => state.characterId === input.characterId && state.claimId === input.claimId && input.eventOrder[state.asOfEvent] !== undefined && input.eventOrder[state.asOfEvent] <= target).sort((a, b) => input.eventOrder[b.asOfEvent] - input.eventOrder[a.asOfEvent]);
  const latest = states[0];
  if (!latest) return { eligible: false, reason: "CHARACTER_HAS_NOT_ACQUIRED_CLAIM" };
  return latest.state === "learned" ? { eligible: true, reason: "CHARACTER_KNOWLEDGE_LEARNED" } : { eligible: false, reason: `CHARACTER_STATE_${latest.state.toUpperCase()}` };
}

function compareProgressCursor(left: string, right: string): number {
  const leftParts = left.match(/\d+|\D+/g) ?? [left];
  const rightParts = right.match(/\d+|\D+/g) ?? [right];
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? "";
    const rightPart = rightParts[index] ?? "";
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const difference = Number(leftPart) - Number(rightPart);
      if (difference !== 0) return difference;
      continue;
    }
    const difference = leftPart.localeCompare(rightPart);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function evaluateReaderKnowledge(input: { states: ReaderKnowledgeState[]; readerScope: string; claimId: string; publicationVersion: string; progressCursor: string }): { eligible: boolean; reason: string } {
  const states = input.states.filter((state) => state.readerScope === input.readerScope && state.claimId === input.claimId && state.publicationVersion === input.publicationVersion && compareProgressCursor(state.progressCursor, input.progressCursor) <= 0).sort((a, b) => compareProgressCursor(b.progressCursor, a.progressCursor));
  const latest = states[0];
  if (!latest) return { eligible: false, reason: "READER_HAS_NOT_SEEN_CLAIM" };
  return latest.state === "seen" || latest.state === "inferable" ? { eligible: true, reason: `READER_${latest.state.toUpperCase()}` } : { eligible: false, reason: "READER_REINTERPRETED_ONLY" };
}

async function append<T>(root: string, relativePath: string, value: T): Promise<void> {
  const target = resolveInside(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(value)}\n`, "utf8");
}
export async function persistCharacterKnowledgeState(root: string, state: CharacterKnowledgeState): Promise<void> { assertCharacterKnowledgeStateIntegrity(state); await append(root, "memory/knowledge/character-events.jsonl", state); }
export async function persistReaderKnowledgeState(root: string, state: ReaderKnowledgeState): Promise<void> { assertReaderKnowledgeStateIntegrity(state); await append(root, "memory/knowledge/reader-events.jsonl", state); }
async function readJsonl<T>(root: string, relativePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(resolveInside(root, relativePath), "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}
export function assertCharacterKnowledgeStateIntegrity(state: CharacterKnowledgeState): CharacterKnowledgeState {
  const { fingerprint, ...base } = state;
  const valid = state?.schemaVersion === "character-knowledge-state.v1" && [state.stateId, state.characterId, state.claimId, state.asOfEvent].every((value) => typeof value === "string" && value.trim()) && ["learned", "forgotten", "misbelieved", "challenged", "seen", "inferable", "reinterpreted"].includes(state.state) && Array.isArray(state.evidenceRefs) && state.evidenceRefs.length > 0 && state.evidenceRefs.every((value) => typeof value === "string" && value.trim()) && /^[a-f0-9]{64}$/i.test(state.fingerprint) && hash(base) === state.fingerprint;
  if (!valid) throw new Error("CHARACTER_KNOWLEDGE_INTEGRITY_FAILED");
  return state;
}
export function assertReaderKnowledgeStateIntegrity(state: ReaderKnowledgeState): ReaderKnowledgeState {
  const { fingerprint, ...base } = state;
  const valid = state?.schemaVersion === "reader-knowledge-state.v1" && [state.stateId, state.readerScope, state.claimId, state.publicationVersion, state.progressCursor].every((value) => typeof value === "string" && value.trim()) && ["seen", "inferable", "reinterpreted"].includes(state.state) && Array.isArray(state.evidenceRefs) && state.evidenceRefs.length > 0 && state.evidenceRefs.every((value) => typeof value === "string" && value.trim()) && /^[a-f0-9]{64}$/i.test(state.fingerprint) && hash(base) === state.fingerprint;
  if (!valid) throw new Error("READER_KNOWLEDGE_INTEGRITY_FAILED");
  return state;
}
export async function listCharacterKnowledgeStates(root: string): Promise<CharacterKnowledgeState[]> { return (await readJsonl<CharacterKnowledgeState>(root, "memory/knowledge/character-events.jsonl")).map(assertCharacterKnowledgeStateIntegrity); }
export async function listReaderKnowledgeStates(root: string): Promise<ReaderKnowledgeState[]> { return (await readJsonl<ReaderKnowledgeState>(root, "memory/knowledge/reader-events.jsonl")).map(assertReaderKnowledgeStateIntegrity); }
