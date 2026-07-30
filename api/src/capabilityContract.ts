import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface CapabilityContract {
  schemaVersion: "capability-contract.v1";
  capabilityId: string;
  projectSlug: string;
  holderId: string;
  name: string;
  sourceRefs: string[];
  canDo: string;
  cannotDo: string[];
  prerequisites: string[];
  inputs: string[];
  consumption: string[];
  scope: string[];
  duration: string;
  cooldown: string;
  precision: string;
  counters: string[];
  progressionPath: string[];
  disclosure: string;
  evidenceRefs: string[];
  permanent: false;
  status: "candidate" | "confirmed" | "retired";
  progressionEventIds: string[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
export type AcquisitionKind = "permanent" | "temporary-boost" | "borrowed-tool" | "external-aid" | "discovery" | "exchange";
export interface ProgressionEvent { schemaVersion: "progression-event.v1"; progressionId: string; capabilityId: string; trigger: string; acquisition: string; acquisitionKind: AcquisitionKind; retained: string; abandoned: string; limitation: string; newChoice: string; proseRefs: string[]; sourceRefs: string[]; createdAt: string; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function capabilityPath(root: string, id: string): string { return resolveInside(root, `sessions/capability-contracts/${id}.json`); }
function progressionPath(root: string, id: string): string { return resolveInside(root, `sessions/progression-events/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export async function readCapabilityContract(root: string, capabilityId: string): Promise<CapabilityContract | null> { return readJson<CapabilityContract>(capabilityPath(root, capabilityId)); }
export async function listCapabilityContracts(root: string, projectSlug: string): Promise<CapabilityContract[]> { const directory = resolveInside(root, "sessions/capability-contracts"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<CapabilityContract>(path.join(directory, name)))); return records.filter((record): record is CapabilityContract => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function createCapabilityContract(input: { root: string; projectSlug: string; holderId: string; name: string; sourceRefs: readonly string[]; canDo: string; cannotDo: readonly string[]; prerequisites: readonly string[]; inputs: readonly string[]; consumption: readonly string[]; scope: readonly string[]; duration: string; cooldown: string; precision: string; counters: readonly string[]; progressionPath: readonly string[]; disclosure: string; evidenceRefs: readonly string[] }): Promise<CapabilityContract> {
  if (!input.projectSlug.trim() || !input.holderId.trim() || !input.name.trim() || !input.canDo.trim() || !input.duration.trim() || !input.cooldown.trim() || !input.precision.trim()) throw new Error("CAPABILITY_FIELDS_REQUIRED");
  if (!input.sourceRefs.length || !input.evidenceRefs.length) throw new Error("CAPABILITY_SOURCE_REQUIRED");
  if (!input.consumption.length) throw new Error("CAPABILITY_CONSUMPTION_REQUIRED");
  if (!input.prerequisites.length || !input.inputs.length || !input.scope.length || !input.counters.length || !input.progressionPath.length) throw new Error("CAPABILITY_BOUNDARIES_REQUIRED");
  const capabilityId = `capability-${input.projectSlug}-${input.holderId}-${hash({ name: input.name, holderId: input.holderId }).slice(0, 16)}`;
  const existing = await readCapabilityContract(input.root, capabilityId); if (existing) return existing;
  const base = { schemaVersion: "capability-contract.v1" as const, capabilityId, projectSlug: input.projectSlug, holderId: input.holderId, name: input.name, sourceRefs: [...input.sourceRefs], canDo: input.canDo, cannotDo: [...input.cannotDo], prerequisites: [...input.prerequisites], inputs: [...input.inputs], consumption: [...input.consumption], scope: [...input.scope], duration: input.duration, cooldown: input.cooldown, precision: input.precision, counters: [...input.counters], progressionPath: [...input.progressionPath], disclosure: input.disclosure, evidenceRefs: [...input.evidenceRefs], permanent: false as const, status: "candidate" as const, progressionEventIds: [] as string[], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const capability: CapabilityContract = { ...base, fingerprint: hash(base) }; await writeJson(capabilityPath(input.root, capabilityId), capability); return capability;
}
export async function createProgressionEvent(input: { root: string; capabilityId: string; trigger: string; acquisition: string; acquisitionKind?: AcquisitionKind; retained: string; abandoned: string; limitation: string; newChoice: string; proseRefs: readonly string[]; sourceRefs: readonly string[] }): Promise<ProgressionEvent> {
  const capability = await readCapabilityContract(input.root, input.capabilityId); if (!capability) throw new Error("CAPABILITY_NOT_FOUND");
  if ([input.trigger, input.acquisition, input.retained, input.abandoned, input.limitation, input.newChoice].some((value) => !value.trim())) throw new Error("PROGRESSION_FIELDS_REQUIRED");
  if (!input.proseRefs.length || !input.sourceRefs.length) throw new Error("PROGRESSION_EVIDENCE_REQUIRED");
  const progressionId = `progression-${capability.capabilityId}-${hash({ trigger: input.trigger, proseRefs: input.proseRefs }).slice(0, 16)}`;
  const existing = await readJson<ProgressionEvent>(progressionPath(input.root, progressionId)); if (existing) return existing;
  const base = { schemaVersion: "progression-event.v1" as const, progressionId, capabilityId: input.capabilityId, trigger: input.trigger, acquisition: input.acquisition, acquisitionKind: input.acquisitionKind ?? "permanent" as const, retained: input.retained, abandoned: input.abandoned, limitation: input.limitation, newChoice: input.newChoice, proseRefs: [...input.proseRefs], sourceRefs: [...input.sourceRefs], createdAt: new Date().toISOString() };
  const event: ProgressionEvent = { ...base, fingerprint: hash(base) }; await writeJson(progressionPath(input.root, progressionId), event);
  const updated: CapabilityContract = { ...capability, status: "confirmed", progressionEventIds: [...capability.progressionEventIds, progressionId], updatedAt: new Date().toISOString() }; await writeJson(capabilityPath(input.root, capability.capabilityId), { ...updated, fingerprint: hash(updated) });
  return event;
}
