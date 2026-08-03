import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface WorldStateSnapshot {
  schemaVersion: "world-state-snapshot.v1";
  snapshotId: string;
  projectSlug: string;
  asOf: string;
  region: string;
  publicationVersion: string;
  politicalControl: string[];
  activeConflicts: string[];
  institutions: string[];
  infrastructure: string[];
  markets: string[];
  environment: string[];
  resources: string[];
  effectiveRuleIds: string[];
  unknowns: string[];
  sourceRefs: string[];
  createdAt: string;
  fingerprint: string;
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function snapshotPath(root: string, id: string): string { return resolveInside(root, `sessions/world-state-snapshots/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function stringArray(value: unknown, required = false): value is string[] { return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmpty); }
export function assertWorldStateSnapshotIntegrity(snapshot: WorldStateSnapshot, expectedId?: string): WorldStateSnapshot {
  const { fingerprint, ...base } = snapshot;
  const lists = [snapshot.politicalControl, snapshot.activeConflicts, snapshot.institutions, snapshot.infrastructure, snapshot.markets, snapshot.environment, snapshot.resources, snapshot.effectiveRuleIds].every((value) => stringArray(value));
  const valid = snapshot.schemaVersion === "world-state-snapshot.v1" && (!expectedId || snapshot.snapshotId === expectedId) && [snapshot.snapshotId, snapshot.projectSlug, snapshot.asOf, snapshot.region, snapshot.publicationVersion, snapshot.createdAt].every(nonEmpty) && lists && stringArray(snapshot.unknowns, true) && stringArray(snapshot.sourceRefs, true) && Number.isFinite(Date.parse(snapshot.createdAt)) && /^[a-f0-9]{64}$/i.test(snapshot.fingerprint) && hash(base) === snapshot.fingerprint;
  if (!valid) throw new Error("WORLD_STATE_SNAPSHOT_INTEGRITY_FAILED");
  return snapshot;
}
export async function readWorldStateSnapshot(root: string, snapshotId: string): Promise<WorldStateSnapshot | null> { const snapshot = await readJson<WorldStateSnapshot>(snapshotPath(root, snapshotId)); return snapshot ? assertWorldStateSnapshotIntegrity(snapshot, snapshotId) : null; }
export async function listWorldStateSnapshots(root: string, projectSlug: string, region?: string): Promise<WorldStateSnapshot[]> {
  const directory = resolveInside(root, "sessions/world-state-snapshots"); let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => { const record = await readJson<WorldStateSnapshot>(path.join(directory, name)); return record ? assertWorldStateSnapshotIntegrity(record, name.slice(0, -5)) : null; }));
  return records.filter((record): record is WorldStateSnapshot => Boolean(record && record.projectSlug === projectSlug && (!region || record.region === region))).sort((a, b) => a.asOf.localeCompare(b.asOf));
}
export async function recordWorldStateSnapshot(input: Omit<WorldStateSnapshot, "schemaVersion" | "snapshotId" | "createdAt" | "fingerprint"> & { root: string }): Promise<WorldStateSnapshot> {
  if (!input.projectSlug.trim() || !input.asOf.trim() || !input.region.trim() || !input.publicationVersion.trim()) throw new Error("WORLD_STATE_FIELDS_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("WORLD_STATE_SOURCE_REQUIRED");
  if (!input.unknowns.length) throw new Error("WORLD_STATE_UNKNOWN_REQUIRED");
  const snapshotId = `world-state-${input.projectSlug}-${hash({ asOf: input.asOf, region: input.region, publicationVersion: input.publicationVersion }).slice(0, 16)}`;
  const existing = await readWorldStateSnapshot(input.root, snapshotId); if (existing) return existing;
  const base = { schemaVersion: "world-state-snapshot.v1" as const, snapshotId, projectSlug: input.projectSlug, asOf: input.asOf, region: input.region, publicationVersion: input.publicationVersion, politicalControl: [...input.politicalControl], activeConflicts: [...input.activeConflicts], institutions: [...input.institutions], infrastructure: [...input.infrastructure], markets: [...input.markets], environment: [...input.environment], resources: [...input.resources], effectiveRuleIds: [...input.effectiveRuleIds], unknowns: [...input.unknowns], sourceRefs: [...input.sourceRefs], createdAt: new Date().toISOString() };
  const snapshot: WorldStateSnapshot = { ...base, fingerprint: hash(base) }; await writeJson(snapshotPath(input.root, snapshotId), snapshot); return snapshot;
}
