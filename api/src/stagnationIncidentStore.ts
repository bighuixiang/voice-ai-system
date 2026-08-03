import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { StagnationIncident } from "./stagnationDetection.js";

export interface PersistedStagnationIncident {
  schemaVersion: "stagnation-incident-record.v1";
  incidentId: string;
  projectSlug: string;
  bookRunId?: string;
  incident: StagnationIncident;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function recordPath(root: string, incidentId: string): string { return resolveInside(root, `sessions/stagnation-incidents/${incidentId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }

export function assertStagnationIncidentIntegrity(record: PersistedStagnationIncident): PersistedStagnationIncident {
  const { fingerprint: _fingerprint, ...base } = record;
  const valid = record.schemaVersion === "stagnation-incident-record.v1" && Boolean(record.incidentId?.trim() && record.projectSlug?.trim() && record.createdAt?.trim() && record.incident && record.incident.schemaVersion === "stagnation-incident.v1") && /^[a-f0-9]{64}$/i.test(record.fingerprint) && hash(base) === record.fingerprint;
  if (!valid) throw new Error("STAGNATION_INCIDENT_INTEGRITY_FAILED");
  return record;
}

export async function readStagnationIncident(root: string, incidentId: string): Promise<PersistedStagnationIncident | null> {
  try { return assertStagnationIncidentIntegrity(JSON.parse(await fs.readFile(recordPath(root, incidentId), "utf8")) as PersistedStagnationIncident); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistStagnationIncident(root: string, input: { incidentId: string; projectSlug: string; bookRunId?: string; incident: StagnationIncident }): Promise<{ record: PersistedStagnationIncident; created: boolean }> {
  if (!input.incidentId.trim() || !input.projectSlug.trim()) throw new Error("STAGNATION_INCIDENT_FIELDS_INVALID");
  const existing = await readStagnationIncident(root, input.incidentId);
  if (existing) {
    if (existing.projectSlug !== input.projectSlug || (existing.bookRunId || "") !== (input.bookRunId || "")) throw new Error("STAGNATION_INCIDENT_SCOPE_CONFLICT");
    return { record: existing, created: false };
  }
  const base = { schemaVersion: "stagnation-incident-record.v1" as const, incidentId: input.incidentId, projectSlug: input.projectSlug, ...(input.bookRunId?.trim() ? { bookRunId: input.bookRunId.trim() } : {}), incident: input.incident, createdAt: new Date().toISOString() };
  const record: PersistedStagnationIncident = { ...base, fingerprint: hash(base) };
  await writeJson(recordPath(root, input.incidentId), record);
  return { record, created: true };
}
