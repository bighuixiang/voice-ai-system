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
export async function readStructureAlternativeSet(root: string, setId: string): Promise<StructureAlternativeSet | null> { return readJson<StructureAlternativeSet>(setPath(root, setId)); }
export async function listStructureAlternativeSets(root: string, projectSlug: string): Promise<StructureAlternativeSet[]> { const directory = resolveInside(root, "sessions/structure-alternatives"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<StructureAlternativeSet>(path.join(directory, name)))); return records.filter((record): record is StructureAlternativeSet => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function createStructureAlternativeSet(input: { root: string; projectSlug: string; setId: string; contractFingerprint: string; alternatives: readonly StructureAlternative[]; sourceRefs: readonly string[] }): Promise<StructureAlternativeSet> {
  if (!/^[a-f0-9]{64}$/i.test(input.contractFingerprint)) throw new Error("STRUCTURE_CONTRACT_FINGERPRINT_REQUIRED");
  if (!input.projectSlug.trim() || !input.setId.trim() || input.alternatives.length < 2 || input.alternatives.length > 3) throw new Error("STRUCTURE_ALTERNATIVES_COUNT_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("STRUCTURE_ALTERNATIVE_SOURCE_REQUIRED");
  const signatures = input.alternatives.map((alternative) => JSON.stringify(alternative.sequence)); if (new Set(signatures).size !== signatures.length) throw new Error("STRUCTURE_ALTERNATIVES_NOT_DISTINCT");
  if (input.alternatives.some((alternative) => !alternative.label.trim() || alternative.sequence.length < 2 || !alternative.pacing.trim() || !alternative.agency.trim() || !alternative.suspenseFairness.trim() || !alternative.payoffDifficulty.trim() || !alternative.lengthImpact.trim() || !alternative.changeScope.trim())) throw new Error("STRUCTURE_ALTERNATIVE_FIELDS_REQUIRED");
  const existing = await readStructureAlternativeSet(input.root, input.setId); if (existing) return existing;
  const base = { schemaVersion: "structure-alternative-set.v1" as const, setId: input.setId, projectSlug: input.projectSlug, contractFingerprint: input.contractFingerprint, alternatives: input.alternatives.map((alternative) => ({ ...alternative, sequence: [...alternative.sequence] })), sourceRefs: [...input.sourceRefs], createdAt: new Date().toISOString() };
  const set: StructureAlternativeSet = { ...base, fingerprint: hash(base) }; await writeJson(setPath(input.root, input.setId), set); return set;
}
