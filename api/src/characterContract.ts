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
export function assertCharacterContractIntegrity(contract: CharacterDramaticContract, expectedId?: string): CharacterDramaticContract { const { fingerprint: _fingerprint, ...base } = contract; const required = [contract.contractId, contract.projectSlug, contract.characterId, contract.displayName, contract.externalWant, contract.internalNeed, contract.falseBelief, contract.woundOrFear, contract.contradiction, contract.stake, contract.unacceptableChoice, contract.potentialChange]; const sourcesValid = Array.isArray(contract.sources) && contract.sources.length > 0 && contract.sources.every((source) => Boolean(source?.field?.trim() && source.sourceVersion?.trim() && Array.isArray(source.evidenceRefs) && source.evidenceRefs.length > 0 && source.evidenceRefs.every((ref) => typeof ref === "string" && ref.trim()))); const confirmationValid = contract.lifecycle === "candidate" ? contract.confirmation === undefined : Boolean(contract.confirmation?.actor?.trim() && contract.confirmation.reason?.trim() && contract.confirmation.confirmedAt?.trim()); const valid = contract.schemaVersion === "character-dramatic-contract.v1" && Number.isInteger(contract.contractVersion) && contract.contractVersion > 0 && (!expectedId || contract.contractId === expectedId) && required.every((value) => typeof value === "string" && value.trim()) && [contract.valuesAndBoundaries, contract.unknown].every((values) => Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === "string" && value.trim())) && sourcesValid && ["candidate", "confirmed"].includes(contract.lifecycle) && confirmationValid && /^[a-f0-9]{64}$/i.test(contract.fingerprint) && hash(base) === contract.fingerprint; if (!valid) throw new Error("CHARACTER_CONTRACT_INTEGRITY_FAILED"); return contract; }

export async function readCharacterDramaticContract(root: string, contractId: string): Promise<CharacterDramaticContract | null> { const value = await readJson<CharacterDramaticContract>(contractPath(root, contractId)); return value ? assertCharacterContractIntegrity(value, contractId) : null; }

export async function listCharacterContracts(root: string, projectSlug: string): Promise<CharacterDramaticContract[]> {
  const directory = resolveInside(root, "sessions/character-contracts");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => { const value = await readJson<CharacterDramaticContract>(path.join(directory, name)); return value ? assertCharacterContractIntegrity(value, name.slice(0, -5)) : null; }));
  return records.filter((record): record is CharacterDramaticContract => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createCharacterDramaticContract(input: Omit<CharacterDramaticContract, "schemaVersion" | "contractVersion" | "supersedesContractId" | "contractId" | "lifecycle" | "confirmation" | "createdAt" | "updatedAt" | "fingerprint"> & { root: string }): Promise<CharacterDramaticContract> {
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
  const { fingerprint: _oldFingerprint, ...mergedWithoutFingerprint } = merged;
  const base = { ...mergedWithoutFingerprint, contractVersion: version, contractId, supersedesContractId: existing.contractId, lifecycle: "candidate" as const, confirmation: undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const contract: CharacterDramaticContract = { ...base, fingerprint: hash(base) };
  await writeJson(contractPath(input.root, contractId), contract);
  return contract;
}

export async function confirmCharacterContract(input: { root: string; contractId: string; actor: string; reason: string }): Promise<CharacterDramaticContract> {
  if (!input.actor.trim() || !input.reason.trim()) throw new Error("CHARACTER_CONTRACT_CONFIRMATION_REQUIRED");
  const existing = await readCharacterDramaticContract(input.root, input.contractId);
  if (!existing) throw new Error("CHARACTER_CONTRACT_NOT_FOUND");
  if (existing.lifecycle === "confirmed") return existing;
  const { fingerprint: _oldFingerprint, ...existingWithoutFingerprint } = existing;
  const base = { ...existingWithoutFingerprint, lifecycle: "confirmed" as const, confirmation: { actor: input.actor, reason: input.reason, confirmedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
  const contract: CharacterDramaticContract = { ...base, fingerprint: hash(base) };
  await writeJson(contractPath(input.root, contract.contractId), contract);
  return contract;
}
