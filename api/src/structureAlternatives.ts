import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface StructureAlternative { alternativeId: string; label: string; sequence: string[]; pacing: string; agency: string; suspenseFairness: string; payoffDifficulty: string; lengthImpact: string; changeScope: string; }
export interface StructureAlternativeSet { schemaVersion: "structure-alternative-set.v1"; setId: string; projectSlug: string; contractFingerprint: string; alternatives: StructureAlternative[]; sourceRefs: string[]; createdAt: string; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function setPath(root: string, id: string): string { return resolveInside(root, `sessions/structure-alternatives/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export function assertStructureAlternativeSetIntegrity(set: StructureAlternativeSet, expectedId?: string): StructureAlternativeSet {
  const { fingerprint, ...base } = set;
  const alternativesValid = Array.isArray(set.alternatives) && set.alternatives.length >= 2 && set.alternatives.length <= 3 && new Set(set.alternatives.map((item) => item.alternativeId)).size === set.alternatives.length && set.alternatives.every((item) => item && typeof item.alternativeId === "string" && item.alternativeId.trim() && typeof item.label === "string" && item.label.trim() && Array.isArray(item.sequence) && item.sequence.length >= 2 && item.sequence.every((value) => typeof value === "string" && value.trim()) && [item.pacing, item.agency, item.suspenseFairness, item.payoffDifficulty, item.lengthImpact, item.changeScope].every((value) => typeof value === "string" && value.trim()));
  const valid = set?.schemaVersion === "structure-alternative-set.v1" && (!expectedId || set.setId === expectedId) && [set.setId, set.projectSlug, set.createdAt].every((value) => typeof value === "string" && value.trim()) && /^[a-f0-9]{64}$/i.test(set.contractFingerprint) && alternativesValid && Array.isArray(set.sourceRefs) && set.sourceRefs.length > 0 && set.sourceRefs.every((value) => typeof value === "string" && value.trim()) && !Number.isNaN(Date.parse(set.createdAt)) && /^[a-f0-9]{64}$/i.test(set.fingerprint) && hash(base) === set.fingerprint;
  if (!valid) throw new Error("STRUCTURE_ALTERNATIVE_SET_INTEGRITY_FAILED");
  return set;
}
export async function readStructureAlternativeSet(root: string, setId: string): Promise<StructureAlternativeSet | null> { const set = await readJson<StructureAlternativeSet>(setPath(root, setId)); return set ? assertStructureAlternativeSetIntegrity(set, setId) : null; }
export async function listStructureAlternativeSets(root: string, projectSlug: string): Promise<StructureAlternativeSet[]> { const directory = resolveInside(root, "sessions/structure-alternatives"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => { const set = await readJson<StructureAlternativeSet>(path.join(directory, name)); return set ? assertStructureAlternativeSetIntegrity(set, name.slice(0, -5)) : null; })); return records.filter((record): record is StructureAlternativeSet => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function createStructureAlternativeSet(input: { root: string; projectSlug: string; setId: string; contractFingerprint: string; alternatives: readonly StructureAlternative[]; sourceRefs: readonly string[] }): Promise<StructureAlternativeSet> {
  if (!/^[a-f0-9]{64}$/i.test(input.contractFingerprint)) throw new Error("STRUCTURE_CONTRACT_FINGERPRINT_REQUIRED");
  if (!input.projectSlug.trim() || !input.setId.trim() || input.alternatives.length < 2 || input.alternatives.length > 3) throw new Error("STRUCTURE_ALTERNATIVES_COUNT_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("STRUCTURE_ALTERNATIVE_SOURCE_REQUIRED");
  const signatures = input.alternatives.map((alternative) => JSON.stringify(alternative.sequence)); if (new Set(signatures).size !== signatures.length) throw new Error("STRUCTURE_ALTERNATIVES_NOT_DISTINCT");
  if (input.alternatives.some((alternative) => !alternative.label.trim() || alternative.sequence.length < 2 || !alternative.pacing.trim() || !alternative.agency.trim() || !alternative.suspenseFairness.trim() || !alternative.payoffDifficulty.trim() || !alternative.lengthImpact.trim() || !alternative.changeScope.trim())) throw new Error("STRUCTURE_ALTERNATIVE_FIELDS_REQUIRED");
  const dimensions: Array<keyof Pick<StructureAlternative, "pacing" | "agency" | "suspenseFairness" | "payoffDifficulty" | "lengthImpact" | "changeScope">> = ["pacing", "agency", "suspenseFairness", "payoffDifficulty", "lengthImpact", "changeScope"];
  const baseline = input.alternatives[0];
  const structuralDifferenceCount = input.alternatives.slice(1).reduce((count, alternative) => count + dimensions.filter((dimension) => alternative[dimension] !== baseline[dimension]).length, 0);
  if (structuralDifferenceCount < 2) throw new Error("STRUCTURE_ALTERNATIVES_NOT_STRUCTURALLY_DISTINCT");
  const existing = await readStructureAlternativeSet(input.root, input.setId); if (existing) return existing;
  const base = { schemaVersion: "structure-alternative-set.v1" as const, setId: input.setId, projectSlug: input.projectSlug, contractFingerprint: input.contractFingerprint, alternatives: input.alternatives.map((alternative) => ({ ...alternative, sequence: [...alternative.sequence] })), sourceRefs: [...input.sourceRefs], createdAt: new Date().toISOString() };
  const set: StructureAlternativeSet = { ...base, fingerprint: hash(base) }; await writeJson(setPath(input.root, input.setId), set); return set;
}
