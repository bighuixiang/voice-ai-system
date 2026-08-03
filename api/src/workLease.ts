export interface WorkLease {
  schemaVersion: "work-lease.v1";
  leaseId: string;
  workItemId: string;
  writeSet: string;
  ownerId: string;
  fencingToken: number;
  acquiredAtMs: number;
  expiresAtMs: number;
  renewedAtMs?: number;
  releasedAtMs?: number;
}

function validPositive(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function assertIdentity(input: { ownerId: string; fencingToken: number }): void { if (!input.ownerId.trim()) throw new Error("WORK_LEASE_OWNER_REQUIRED"); if (!Number.isInteger(input.fencingToken) || input.fencingToken < 1) throw new Error("WORK_LEASE_TOKEN_INVALID"); }

export function acquireWorkLease(existing: WorkLease | undefined, input: { workItemId: string; writeSet: string; ownerId: string; nowMs: number; ttlMs: number }): WorkLease {
  if (!input.workItemId.trim() || !input.writeSet.trim() || !input.ownerId.trim() || !validPositive(input.nowMs) || !Number.isFinite(input.ttlMs) || input.ttlMs <= 0) throw new Error("WORK_LEASE_INPUT_INVALID");
  if (existing && !existing.releasedAtMs && existing.expiresAtMs > input.nowMs) throw new Error("WORK_LEASE_ACTIVE");
  const token = (existing?.fencingToken || 0) + 1;
  return { schemaVersion: "work-lease.v1", leaseId: `lease-${input.workItemId}-${token}`, workItemId: input.workItemId, writeSet: input.writeSet, ownerId: input.ownerId, fencingToken: token, acquiredAtMs: input.nowMs, expiresAtMs: input.nowMs + input.ttlMs };
}

export function assertWorkLease(lease: WorkLease, input: { ownerId: string; fencingToken: number; nowMs: number }): void {
  assertIdentity(input);
  if (lease.ownerId !== input.ownerId || lease.fencingToken !== input.fencingToken) throw new Error("FENCING_TOKEN_LOST");
  if (lease.releasedAtMs !== undefined || lease.expiresAtMs <= input.nowMs) throw new Error("WORK_LEASE_EXPIRED");
}

export function renewWorkLease(lease: WorkLease, input: { ownerId: string; fencingToken: number; nowMs: number; ttlMs: number }): WorkLease {
  assertWorkLease(lease, input);
  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) throw new Error("WORK_LEASE_TTL_INVALID");
  return { ...lease, renewedAtMs: input.nowMs, expiresAtMs: input.nowMs + input.ttlMs };
}

export function releaseWorkLease(lease: WorkLease, input: { ownerId: string; fencingToken: number; nowMs: number }): void {
  assertWorkLease(lease, input);
  lease.releasedAtMs = input.nowMs;
}
