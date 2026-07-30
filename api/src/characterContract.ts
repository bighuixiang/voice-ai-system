import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type CharacterSourceProvenance = "author-confirmed" | "canon-fact" | "character-self-report" | "other-view" | "plan" | "inference" | "unknown";
export interface CharacterContractSource { field: string; provenance: CharacterSourceProvenance; sourceVersion: string; evidenceRefs: string[]; }
export interface CharacterDramaticContract {
  schemaVersion: "character-dramatic-contract.v1";
  contractVersion: number;
  supersedesContractId?: string;
  contractId: string;
  projectSlug: string;
  characterId: string;
  displayName: string;
  externalWant: string;
  internalNeed: string;
  falseBelief: string;
  woundOrFear: string;
  valuesAndBoundaries: string[];
  contradiction: string;
  stake: string;
  unacceptableChoice: string;
  potentialChange: string;
  unknown: string[];
  sources: CharacterContractSource[];
  lifecycle: "candidate" | "confirmed";
  confirmation?: { actor: string; reason: string; confirmedAt: string };
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function contractPath(root: string, contractId: string): string { return resolveInside(root, `sessions/character-contracts/${contractId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

export async function readCharacterDramaticContract(root: string, contractId: string): Promise<CharacterDramaticContract | null> { return readJson<CharacterDramaticContract>(contractPath(root, contractId)); }

export async function listCharacterContracts(root: string, projectSlug: string): Promise<CharacterDramaticContract[]> {
  const directory = resolveInside(root, "sessions/character-contracts");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<CharacterDramaticContract>(path.join(directory, name))));
  return records.filter((record): record is CharacterDramaticContract => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createCharacterDramaticContract(input: Omit<CharacterDramaticContract, "schemaVersion" | "contractVersion" | "supersedesContractId" | "contractId" | "lifecycle" | "confirmation" | "createdAt" | "updatedAt" | "fingerprint">): Promise<CharacterDramaticContract> {
  const required = [input.projectSlug, input.characterId, input.displayName, input.externalWant, input.internalNeed, input.falseBelief, input.woundOrFear, input.contradiction, input.stake, input.unacceptableChoice, input.potentialChange];
  if (required.some((value) => !value.trim()) || !input.valuesAndBoundaries.length) throw new Error("CHARACTER_CONTRACT_FIELDS_REQUIRED");
  if (!input.unknown.length) throw new Error("CHARACTER_CONTRACT_UNKNOWN_REQUIRED");
  if (!input.sources.length) throw new Error("CHARACTER_CONTRACT_SOURCES_REQUIRED");
  if (input.sources.some((source) => !source.field.trim() || !source.sourceVersion.trim() || !source.evidenceRefs.length)) throw new Error("CHARACTER_CONTRACT_SOURCE_INVALID");
  const contractId = `character-contract-${input.projectSlug}-${input.characterId}-${hash({ characterId: input.characterId, sources: input.sources, version: 1 }).slice(0, 12)}`;
  const existing = await readCharacterDramaticContract(input.root, contractId);
  if (existing) return existing;
  const base = { schemaVersion: "character-dramatic-contract.v1" as const, contractVersion: 1, contractId, projectSlug: input.projectSlug, characterId: input.characterId, displayName: input.displayName, externalWant: input.externalWant, internalNeed: input.internalNeed, falseBelief: input.falseBelief, woundOrFear: input.woundOrFear, valuesAndBoundaries: [...input.valuesAndBoundaries], contradiction: input.contradiction, stake: input.stake, unacceptableChoice: input.unacceptableChoice, potentialChange: input.potentialChange, unknown: [...input.unknown], sources: input.sources.map((source) => ({ ...source, evidenceRefs: [...source.evidenceRefs] })), lifecycle: "candidate" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const contract: CharacterDramaticContract = { ...base, fingerprint: hash(base) };
  await writeJson(contractPath(input.root, contractId), contract);
  return contract;
}

export async function reviseCharacterDramaticContract(input: { root: string; contractId: string; actor: string; reason: string; changes: Partial<Pick<CharacterDramaticContract, "displayName" | "externalWant" | "internalNeed" | "falseBelief" | "woundOrFear" | "valuesAndBoundaries" | "contradiction" | "stake" | "unacceptableChoice" | "potentialChange" | "unknown" | "sources">> }): Promise<CharacterDramaticContract> {
  if (!input.actor.trim() || !input.reason.trim()) throw new Error("CHARACTER_CONTRACT_REVISION_REQUIRED");
  const existing = await readCharacterDramaticContract(input.root, input.contractId);
  if (!existing) throw new Error("CHARACTER_CONTRACT_NOT_FOUND");
  const merged = { ...existing, ...input.changes, valuesAndBoundaries: input.changes.valuesAndBoundaries ? [...input.changes.valuesAndBoundaries] : [...existing.valuesAndBoundaries], unknown: input.changes.unknown ? [...input.changes.unknown] : [...existing.unknown], sources: input.changes.sources ? input.changes.sources.map((source) => ({ ...source, evidenceRefs: [...source.evidenceRefs] })) : existing.sources.map((source) => ({ ...source, evidenceRefs: [...source.evidenceRefs] })) };
  if (!merged.unknown.length) throw new Error("CHARACTER_CONTRACT_UNKNOWN_REQUIRED");
  const version = existing.contractVersion + 1;
  const contractId = `character-contract-${existing.projectSlug}-${existing.characterId}-${hash({ supersedes: existing.contractId, version, changes: input.changes }).slice(0, 12)}`;
  const base = { ...merged, contractVersion: version, contractId, supersedesContractId: existing.contractId, lifecycle: "candidate" as const, confirmation: undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const contract: CharacterDramaticContract = { ...base, fingerprint: hash(base) };
  await writeJson(contractPath(input.root, contractId), contract);
  return contract;
}

export async function confirmCharacterContract(input: { root: string; contractId: string; actor: string; reason: string }): Promise<CharacterDramaticContract> {
  if (!input.actor.trim() || !input.reason.trim()) throw new Error("CHARACTER_CONTRACT_CONFIRMATION_REQUIRED");
  const existing = await readCharacterDramaticContract(input.root, input.contractId);
  if (!existing) throw new Error("CHARACTER_CONTRACT_NOT_FOUND");
  if (existing.lifecycle === "confirmed") return existing;
  const base = { ...existing, lifecycle: "confirmed" as const, confirmation: { actor: input.actor, reason: input.reason, confirmedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
  const contract: CharacterDramaticContract = { ...base, fingerprint: hash(base) };
  await writeJson(contractPath(input.root, contract.contractId), contract);
  return contract;
}
