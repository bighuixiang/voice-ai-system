import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readCharacterDramaticContract } from "./characterContract.js";
import { readCharacterStateSnapshot } from "./characterState.js";

export interface CharacterChoiceEvidence {
  schemaVersion: "character-choice-evidence.v1";
  evidenceId: string;
  projectSlug: string;
  characterId: string;
  contractId: string;
  beforeSnapshotId: string;
  choice: string;
  rejectedChoices: string[];
  immediateCost: string;
  delayedCost: string;
  evidenceRefs: string[];
  status: "planned" | "observed";
  afterSnapshotId?: string;
  outcomeRefs?: string[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function evidencePath(root: string, id: string): string { return resolveInside(root, `sessions/character-choice-evidence/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

export async function readCharacterChoiceEvidence(root: string, evidenceId: string): Promise<CharacterChoiceEvidence | null> { return readJson<CharacterChoiceEvidence>(evidencePath(root, evidenceId)); }

export async function createCharacterChoiceEvidence(input: { root: string; projectSlug: string; characterId: string; contractId: string; beforeSnapshotId: string; choice: string; rejectedChoices: readonly string[]; immediateCost: string; delayedCost: string; evidenceRefs: readonly string[] }): Promise<CharacterChoiceEvidence> {
  const contract = await readCharacterDramaticContract(input.root, input.contractId);
  const before = await readCharacterStateSnapshot(input.root, input.beforeSnapshotId);
  if (!contract || contract.projectSlug !== input.projectSlug || contract.characterId !== input.characterId) throw new Error("CHARACTER_CONTRACT_NOT_FOUND");
  if (!before || before.projectSlug !== input.projectSlug || before.characterId !== input.characterId) throw new Error("CHARACTER_STATE_SNAPSHOT_NOT_FOUND");
  if (!before.availableChoices.includes(input.choice)) throw new Error("CHARACTER_CHOICE_NOT_VISIBLE");
  if (!input.choice.trim() || !input.immediateCost.trim() || !input.delayedCost.trim()) throw new Error("CHARACTER_CHOICE_COST_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("CHARACTER_CHOICE_EVIDENCE_REQUIRED");
  const evidenceId = `character-choice-${input.projectSlug}-${input.characterId}-${hash({ before: input.beforeSnapshotId, choice: input.choice, refs: input.evidenceRefs }).slice(0, 16)}`;
  const existing = await readCharacterChoiceEvidence(input.root, evidenceId);
  if (existing) return existing;
  const base = { schemaVersion: "character-choice-evidence.v1" as const, evidenceId, projectSlug: input.projectSlug, characterId: input.characterId, contractId: input.contractId, beforeSnapshotId: input.beforeSnapshotId, choice: input.choice, rejectedChoices: [...input.rejectedChoices], immediateCost: input.immediateCost, delayedCost: input.delayedCost, evidenceRefs: [...input.evidenceRefs], status: "planned" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const evidence: CharacterChoiceEvidence = { ...base, fingerprint: hash(base) };
  await writeJson(evidencePath(input.root, evidenceId), evidence);
  return evidence;
}

export async function observeCharacterChoiceEvidence(input: { root: string; evidenceId: string; afterSnapshotId: string; outcomeRefs: readonly string[] }): Promise<CharacterChoiceEvidence> {
  const existing = await readCharacterChoiceEvidence(input.root, input.evidenceId);
  if (!existing) throw new Error("CHARACTER_CHOICE_EVIDENCE_NOT_FOUND");
  if (existing.status === "observed") return existing;
  const after = await readCharacterStateSnapshot(input.root, input.afterSnapshotId);
  if (!after || after.projectSlug !== existing.projectSlug || after.characterId !== existing.characterId || after.contractId !== existing.contractId) throw new Error("CHARACTER_STATE_SNAPSHOT_NOT_FOUND");
  if (after.snapshotId === existing.beforeSnapshotId) throw new Error("CHARACTER_CHOICE_STATE_CHANGE_REQUIRED");
  if (!input.outcomeRefs.length) throw new Error("CHARACTER_CHOICE_OUTCOME_REQUIRED");
  const base = { ...existing, status: "observed" as const, afterSnapshotId: input.afterSnapshotId, outcomeRefs: [...input.outcomeRefs], updatedAt: new Date().toISOString() };
  const evidence: CharacterChoiceEvidence = { ...base, fingerprint: hash(base) };
  await writeJson(evidencePath(input.root, existing.evidenceId), evidence);
  return evidence;
}
