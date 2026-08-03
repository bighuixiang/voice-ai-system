import { describe, expect, it } from "vitest";
import { acquireWorkLease, assertWorkLease, releaseWorkLease, renewWorkLease, type WorkLease } from "./workLease.js";

describe("work lease fencing", () => {
  it("allows one active writer and rejects a second owner before expiry", () => {
    const first = acquireWorkLease(undefined, { workItemId: "w1", writeSet: "chapter:c1", ownerId: "worker-a", nowMs: 1000, ttlMs: 5000 });
    expect(first.fencingToken).toBe(1);
    expect(() => acquireWorkLease(first, { workItemId: "w1", writeSet: "chapter:c1", ownerId: "worker-b", nowMs: 2000, ttlMs: 5000 })).toThrow("WORK_LEASE_ACTIVE");
  });

  it("replaces an expired lease with a higher fencing token", () => {
    const first = acquireWorkLease(undefined, { workItemId: "w1", writeSet: "chapter:c1", ownerId: "worker-a", nowMs: 1000, ttlMs: 10 });
    const replacement = acquireWorkLease(first, { workItemId: "w1", writeSet: "chapter:c1", ownerId: "worker-b", nowMs: 1011, ttlMs: 10 });
    expect(replacement).toMatchObject({ ownerId: "worker-b", fencingToken: 2 });
    expect(() => assertWorkLease(first, { ownerId: "worker-a", fencingToken: 1, nowMs: 1011 })).toThrow("WORK_LEASE_EXPIRED");
  });

  it("renews and releases only with the current owner and token", () => {
    const lease = acquireWorkLease(undefined, { workItemId: "w1", writeSet: "chapter:c1", ownerId: "worker-a", nowMs: 1000, ttlMs: 10 });
    const renewed = renewWorkLease(lease, { ownerId: "worker-a", fencingToken: 1, nowMs: 1005, ttlMs: 20 });
    expect(renewed.expiresAtMs).toBe(1025);
    expect(releaseWorkLease(renewed, { ownerId: "worker-a", fencingToken: 1, nowMs: 1006 })).toBeUndefined();
  });
});
