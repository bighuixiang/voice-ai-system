import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { assertProviderHealthIntegrity, authorizeProviderAttempt, readProviderHealth, recordProviderFailure, recordProviderSuccess } from "./providerHealth.js";

async function fixture(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), "provider-health-")); }

describe("durable provider health circuit", () => {
  it("opens after transient failures and permits exactly one half-open probe", async () => {
    const root = await fixture();
    await recordProviderFailure(root, "provider-a", "HTTP_503", { now: "2026-07-31T00:00:00.000Z", failureThreshold: 2, cooldownMs: 1000 });
    const opened = await recordProviderFailure(root, "provider-a", "HTTP_503", { now: "2026-07-31T00:00:00.100Z", failureThreshold: 2, cooldownMs: 1000 });
    expect(opened.state).toBe("open");
    await expect(authorizeProviderAttempt(root, "provider-a", "2026-07-31T00:00:00.500Z")).resolves.toMatchObject({ allow: false, state: "open" });
    await expect(authorizeProviderAttempt(root, "provider-a", "2026-07-31T00:00:01.100Z")).resolves.toMatchObject({ allow: true, state: "half-open" });
    await expect(authorizeProviderAttempt(root, "provider-a", "2026-07-31T00:00:01.200Z")).resolves.toMatchObject({ allow: false, state: "open" });
  });

  it("does not count deterministic failures and closes after a successful probe", async () => {
    const root = await fixture();
    const deterministic = await recordProviderFailure(root, "provider-b", "AUTH_DENIED", { now: "2026-07-31T00:00:00.000Z", failureThreshold: 1, cooldownMs: 1000 });
    expect(deterministic).toMatchObject({ state: "closed", consecutiveFailures: 0 });
    await recordProviderFailure(root, "provider-b", "HTTP_503", { now: "2026-07-31T00:00:00.100Z", failureThreshold: 1, cooldownMs: 1000 });
    await recordProviderSuccess(root, "provider-b", "2026-07-31T00:00:00.200Z");
    await expect(readProviderHealth(root, "provider-b")).resolves.toMatchObject({ state: "closed", consecutiveFailures: 0, halfOpenProbeInFlight: false });
  });

  it("admits only one recovery probe when callers authorize concurrently", async () => {
    const root = await fixture();
    await recordProviderFailure(root, "provider-c", "HTTP_503", { now: "2026-07-31T00:00:00.000Z", failureThreshold: 1, cooldownMs: 1000 });

    const decisions = await Promise.all([
      authorizeProviderAttempt(root, "provider-c", "2026-07-31T00:00:01.100Z"),
      authorizeProviderAttempt(root, "provider-c", "2026-07-31T00:00:01.100Z")
    ]);

    expect(decisions.filter((item) => item.allow)).toHaveLength(1);
    expect(decisions.filter((item) => !item.allow)).toHaveLength(1);
    await expect(readProviderHealth(root, "provider-c")).resolves.toMatchObject({ state: "half-open", halfOpenProbeInFlight: true });
  });

  it("rejects a rehashed health record with an invalid opened timestamp", () => {
    const record = { schemaVersion: "provider-health.v1" as const, providerRef: "provider-shape", state: "open" as const, consecutiveFailures: 1, failureThreshold: 1, cooldownMs: 1000, openedAt: "not-a-date", halfOpenProbeInFlight: false, updatedAt: "2026-07-31T00:00:00.000Z" };
    const forged = { ...record, fingerprint: crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex") };
    expect(() => assertProviderHealthIntegrity(forged)).toThrow("PROVIDER_HEALTH_INTEGRITY_FAILED");
  });
});
