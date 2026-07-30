import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { activateRelease, readReleaseActivation } from "./releaseActivation.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("release activation", () => {
  it("fails closed when release acceptance is not accepted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-activation-")); roots.push(root);
    await expect(activateRelease(root, { status: "do-not-activate", releaseProfile: "RP5-drafting", fingerprint: "a".repeat(64) })).rejects.toThrow("RELEASE_ACCEPTANCE_REQUIRED");
    await expect(readReleaseActivation(root)).resolves.toBeNull();
  });

  it("persists an acceptance-bound activation and is idempotent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-activation-")); roots.push(root);
    const decision = { status: "accepted" as const, releaseProfile: "RP5-drafting" as const, fingerprint: "b".repeat(64) };
    const first = await activateRelease(root, decision);
    const second = await activateRelease(root, decision);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ schemaVersion: "release-activation.v1", status: "active", acceptanceFingerprint: decision.fingerprint });
    await expect(readReleaseActivation(root)).resolves.toEqual(first);
  });

  it("rejects a different acceptance decision after activation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-activation-")); roots.push(root);
    await activateRelease(root, { status: "accepted", releaseProfile: "RP5-drafting", fingerprint: "c".repeat(64) });
    await expect(activateRelease(root, { status: "accepted", releaseProfile: "RP5-drafting", fingerprint: "d".repeat(64) })).rejects.toThrow("RELEASE_ACTIVATION_STALE");
  });

  it("fails closed when the persisted activation fingerprint is corrupted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-activation-")); roots.push(root);
    const decision = { status: "accepted" as const, releaseProfile: "RP5-drafting" as const, fingerprint: "e".repeat(64) };
    await activateRelease(root, decision);
    const target = path.join(root, "release-activation.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.fingerprint = "f".repeat(64);
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(activateRelease(root, decision)).rejects.toThrow("RELEASE_ACTIVATION_CORRUPT");
    await expect(readReleaseActivation(root)).rejects.toThrow("RELEASE_ACTIVATION_CORRUPT");
  });
});
