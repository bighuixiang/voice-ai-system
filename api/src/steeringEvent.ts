import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type SteeringStatus = "received" | "classified" | "effective" | "queued_for_boundary" | "superseded" | "rejected_stale";
export interface SteeringEvent {
  schemaVersion: "steering-event.v1";
  eventId: string;
  projectSlug: string;
  runId: string;
  direction: string;
  parentRunVersion: number;
  status: SteeringStatus;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function eventPath(root: string, id: string): string { return resolveInside(root, `sessions/steering-events/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
export function assertSteeringEventIntegrity(event: SteeringEvent, expectedId?: string): SteeringEvent {
  const { fingerprint: _fingerprint, ...base } = event;
  if (event.schemaVersion !== "steering-event.v1" || (expectedId !== undefined && event.eventId !== expectedId) || !event.eventId.trim() || !event.projectSlug.trim() || !event.runId.trim() || !event.direction.trim() || !["received", "classified", "effective", "queued_for_boundary", "superseded", "rejected_stale"].includes(event.status) || !Number.isInteger(event.parentRunVersion) || event.parentRunVersion < 1 || !Number.isFinite(Date.parse(event.createdAt)) || !Number.isFinite(Date.parse(event.updatedAt)) || !/^[a-f0-9]{64}$/i.test(event.fingerprint) || hash(base) !== event.fingerprint) throw new Error("STEERING_EVENT_INTEGRITY_FAILED");
  return event;
}
export async function readSteeringEvent(root: string, eventId: string): Promise<SteeringEvent | null> { try { return assertSteeringEventIntegrity(JSON.parse(await fs.readFile(eventPath(root, eventId), "utf8")) as SteeringEvent, eventId); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export async function createSteeringEvent(input: { root: string; projectSlug: string; runId: string; direction: string; parentRunVersion: number }): Promise<SteeringEvent> {
  if (!input.direction.trim()) throw new Error("STEERING_DIRECTION_REQUIRED");
  if (!Number.isFinite(input.parentRunVersion) || input.parentRunVersion <= 0) throw new Error("STEERING_PARENT_VERSION_REQUIRED");
  const eventId = `steering-${input.runId}-${hash({ direction: input.direction, parentRunVersion: input.parentRunVersion }).slice(0, 16)}`;
  const existing = await readSteeringEvent(input.root, eventId); if (existing) return existing;
  const now = new Date().toISOString();
  const base = { schemaVersion: "steering-event.v1" as const, eventId, projectSlug: input.projectSlug, runId: input.runId, direction: input.direction.trim(), parentRunVersion: input.parentRunVersion, status: "received" as const, createdAt: now, updatedAt: now };
  const event: SteeringEvent = { ...base, fingerprint: hash(base) }; await writeJson(eventPath(input.root, eventId), event); return event;
}
export async function advanceSteeringEvent(root: string, eventId: string, status: SteeringStatus, reason?: string): Promise<SteeringEvent> {
  const current = await readSteeringEvent(root, eventId); if (!current) throw new Error("STEERING_EVENT_NOT_FOUND");
  const allowed: Record<SteeringStatus, SteeringStatus[]> = { received: ["classified", "rejected_stale"], classified: ["effective", "queued_for_boundary", "superseded", "rejected_stale"], effective: ["superseded"], queued_for_boundary: ["effective", "superseded"], superseded: [], rejected_stale: [] };
  if (!allowed[current.status].includes(status)) { if (current.status === status) return current; throw new Error("STEERING_EVENT_TRANSITION_INVALID"); }
  const base = { ...current, status, ...(reason ? { reason } : {}), updatedAt: new Date().toISOString() }; const { fingerprint: _old, ...withoutFingerprint } = base; const next: SteeringEvent = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) }; await writeJson(eventPath(root, eventId), next); return next;
}
