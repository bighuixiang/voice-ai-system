import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquirePersistedWorkLease, readWorkLease, releasePersistedWorkLease, renewPersistedWorkLease } from "./workLeaseStore.js";

describe("persisted work lease fencing", () => {
  it("survives reread, renews, releases, and rejects a stale owner", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-lease-store-"));
    try {
      const first = await acquirePersistedWorkLease(root, { workItemId: "w1", writeSet: "chapter:c1", ownerId: "worker-a", nowMs: 1000, ttlMs: 10 });
      expect(await readWorkLease(root, "w1")).toMatchObject({ fencingToken: 1, ownerId: "worker-a" });
      const replacement = await acquirePersistedWorkLease(root, { workItemId: "w1", writeSet: "chapter:c1", ownerId: "worker-b", nowMs: 1011, ttlMs: 20 });
      expect(replacement.fencingToken).toBe(2);
      await expect(renewPersistedWorkLease(root, "w1", { ownerId: "worker-a", fencingToken: first.fencingToken, nowMs: 1012, ttlMs: 20 })).rejects.toThrow("FENCING_TOKEN_LOST");
      const released = await releasePersistedWorkLease(root, "w1", { ownerId: "worker-b", fencingToken: 2, nowMs: 1013 });
      expect(released.releasedAtMs).toBe(1013);
      await expect(readWorkLease(root, "w1")).resolves.toMatchObject({ releasedAtMs: 1013 });
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("rejects a rehashed lease with an invalid expiry boundary", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-lease-store-forged-"));
    const target = path.join(root, "sessions", "work-leases", "w-forged.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    const lease = { schemaVersion: "work-lease.v1" as const, leaseId: "lease-w-forged-1", workItemId: "w-forged", writeSet: "chapter:c1", ownerId: "worker-a", fencingToken: 1, acquiredAtMs: 1000, expiresAtMs: 900 };
    await fs.writeFile(target, JSON.stringify({ lease, fingerprint: crypto.createHash("sha256").update(JSON.stringify(lease)).digest("hex") }), "utf8");
    await expect(readWorkLease(root, "w-forged")).rejects.toThrow("WORK_LEASE_STORE_INTEGRITY_FAILED");
  });
});
