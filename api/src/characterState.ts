import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readCharacterDramaticContract } from "./characterContract.js";

export interface RelationshipState { targetCharacterId: string; trust: number; intimacy?: number; power: number; dependency: number; fear: number; responsibility?: number; publicStance: string; privateStance: string; boundary: string; unpaidDebt: string; }
export interface CharacterStateSnapshot {
  schemaVersion: "character-state-snapshot.v1";
  snapshotId: string;
  projectSlug: string;
  characterId: string;
  contractId: string;
  asOf: string;
  currentGoal: string;
  priority: string;
  belief: string;
  knowledge: string[];
  emotion: string;
  injury: string;
  resources: string[];
  abilitiesAndIdentity: string[];
  relationshipStances: RelationshipState[];
  obligations: string[];
  availableChoices: string[];
  sourceRefs: string[];
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function snapshotPath(root: string, snapshotId: string): string { return resolveInside(root, `sessions/character-state-snapshots/${snapshotId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

export async function readCharacterStateSnapshot(root: string, snapshotId: string): Promise<CharacterStateSnapshot | null> { return readJson<CharacterStateSnapshot>(snapshotPath(root, snapshotId)); }

export async function listCharacterStateSnapshots(root: string, projectSlug: string, characterId?: string): Promise<CharacterStateSnapshot[]> {
  const directory = resolveInside(root, "sessions/character-state-snapshots");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<CharacterStateSnapshot>(path.join(directory, name))));
  return records.filter((record): record is CharacterStateSnapshot => Boolean(record && record.projectSlug === projectSlug && (!characterId || record.characterId === characterId))).sort((a, b) => a.asOf.localeCompare(b.asOf));
}

export async function recordCharacterStateSnapshot(input: Omit<CharacterStateSnapshot, "schemaVersion" | "snapshotId" | "createdAt" | "fingerprint">): Promise<CharacterStateSnapshot> {
  const contract = await readCharacterDramaticContract(input.root, input.contractId);
  if (!contract || contract.projectSlug !== input.projectSlug || contract.characterId !== input.characterId) throw new Error("CHARACTER_CONTRACT_NOT_FOUND");
  if (!input.sourceRefs.length) throw new Error("CHARACTER_STATE_SOURCE_REQUIRED");
  if (!input.asOf.trim() || !input.currentGoal.trim() || !input.priority.trim() || !input.belief.trim() || !input.emotion.trim()) throw new Error("CHARACTER_STATE_FIELDS_REQUIRED");
  const snapshotId = `character-state-${input.projectSlug}-${input.characterId}-${hash({ contractId: input.contractId, asOf: input.asOf, sourceRefs: input.sourceRefs }).slice(0, 16)}`;
  const existing = await readCharacterStateSnapshot(input.root, snapshotId);
  if (existing) return existing;
  const base = { schemaVersion: "character-state-snapshot.v1" as const, snapshotId, projectSlug: input.projectSlug, characterId: input.characterId, contractId: input.contractId, asOf: input.asOf, currentGoal: input.currentGoal, priority: input.priority, belief: input.belief, knowledge: [...input.knowledge], emotion: input.emotion, injury: input.injury, resources: [...input.resources], abilitiesAndIdentity: [...input.abilitiesAndIdentity], relationshipStances: input.relationshipStances.map((item) => ({ ...item, intimacy: item.intimacy ?? 0, responsibility: item.responsibility ?? 0 })), obligations: [...input.obligations], availableChoices: [...input.availableChoices], sourceRefs: [...input.sourceRefs], createdAt: new Date().toISOString() };
  const snapshot: CharacterStateSnapshot = { ...base, fingerprint: hash(base) };
  await writeJson(snapshotPath(input.root, snapshotId), snapshot);
  return snapshot;
}
