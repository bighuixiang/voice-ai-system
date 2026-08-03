import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { acquireWorkLease, assertWorkLease, releaseWorkLease, renewWorkLease, type WorkLease } from "./workLease.js";

interface StoredLease { lease: WorkLease; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const leasePath = (root: string, workItemId: string) => resolveInside(root, path.join("sessions", "work-leases", `${workItemId}.json`));

function assertStored(value: StoredLease, workItemId: string): WorkLease {
  const lease = value?.lease;
  const valid = lease && lease.schemaVersion === "work-lease.v1" && lease.workItemId === workItemId && [lease.leaseId, lease.workItemId, lease.writeSet, lease.ownerId].every((item) => typeof item === "string" && item.trim()) && [lease.fencingToken, lease.acquiredAtMs, lease.expiresAtMs].every((item) => Number.isFinite(item)) && Number.isInteger(lease.fencingToken) && lease.fencingToken >= 1 && lease.expiresAtMs > lease.acquiredAtMs && (lease.renewedAtMs === undefined || Number.isFinite(lease.renewedAtMs)) && (lease.releasedAtMs === undefined || Number.isFinite(lease.releasedAtMs)) && typeof value.fingerprint === "string" && value.fingerprint === hash(lease);
  if (!valid) throw new Error("WORK_LEASE_STORE_INTEGRITY_FAILED");
  return value.lease;
}
async function readStored(root: string, workItemId: string): Promise<WorkLease | undefined> {
  try { return assertStored(JSON.parse(await fs.readFile(leasePath(root, workItemId), "utf8")) as StoredLease, workItemId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return undefined; throw error; }
}
async function writeStored(root: string, lease: WorkLease): Promise<void> {
  const target = leasePath(root, lease.workItemId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify({ lease, fingerprint: hash(lease) }, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readWorkLease(root: string, workItemId: string): Promise<WorkLease | null> { return (await readStored(root, workItemId)) || null; }
export async function acquirePersistedWorkLease(root: string, input: { workItemId: string; writeSet: string; ownerId: string; nowMs: number; ttlMs: number }): Promise<WorkLease> {
  const current = await readStored(root, input.workItemId);
  const next = acquireWorkLease(current, input);
  await writeStored(root, next);
  return next;
}
export async function renewPersistedWorkLease(root: string, workItemId: string, input: { ownerId: string; fencingToken: number; nowMs: number; ttlMs: number }): Promise<WorkLease> {
  const current = await readStored(root, workItemId);
  if (!current) throw new Error("WORK_LEASE_NOT_FOUND");
  const next = renewWorkLease(current, input);
  await writeStored(root, next);
  return next;
}
export async function releasePersistedWorkLease(root: string, workItemId: string, input: { ownerId: string; fencingToken: number; nowMs: number }): Promise<WorkLease> {
  const current = await readStored(root, workItemId);
  if (!current) throw new Error("WORK_LEASE_NOT_FOUND");
  assertWorkLease(current, input);
  releaseWorkLease(current, input);
  await writeStored(root, current);
  return current;
}
