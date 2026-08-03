import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectCapabilityManifest } from "./deliveryGovernance.js";
import { assertProjectCapabilityWrite, readProjectCapabilityManifest, writeProjectCapabilityManifest } from "./projectCapabilityManifest.js";

describe("project capability manifest persistence", () => {
  it("round-trips a fingerprinted manifest and fails closed after tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-capability-manifest-"));
    const manifest = createProjectCapabilityManifest({ projectId: "demo", schemaVersion: "v1", enabledSlices: ["story-seed"], readable: ["story-seed"], writable: ["story-seed"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [] });
    await writeProjectCapabilityManifest(root, manifest);
    await expect(readProjectCapabilityManifest(root, "demo")).resolves.toEqual(manifest);

    const target = path.join(root, "sessions", "project-capability-manifest.json");
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.enabledSlices = ["different-slice"];
    await fs.writeFile(target, `${JSON.stringify(tampered)}\n`, "utf8");
    await expect(readProjectCapabilityManifest(root, "demo")).rejects.toThrow("CAPABILITY_MANIFEST_INTEGRITY_FAILED");
  });

  it("returns no manifest before a project enables a slice", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-capability-manifest-empty-"));
    await expect(readProjectCapabilityManifest(root, "demo")).resolves.toBeNull();
  });

  it("allows legacy projects without a manifest but fences configured projects", () => {
    expect(() => assertProjectCapabilityWrite(null, "runtime")).not.toThrow();
    const manifest = createProjectCapabilityManifest({ projectId: "demo", schemaVersion: "v1", enabledSlices: ["story-seed"], readable: ["story-seed"], writable: ["story-seed"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [] });
    expect(() => assertProjectCapabilityWrite(manifest, "runtime")).toThrow("CAPABILITY_WRITE_NOT_AUTHORIZED:runtime");
    expect(() => assertProjectCapabilityWrite(manifest, "story-seed")).not.toThrow();
  });

  it("requires the current fingerprint before replacing an existing manifest", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-capability-manifest-version-"));
    const original = createProjectCapabilityManifest({ projectId: "demo", schemaVersion: "v1", enabledSlices: ["story-seed"], readable: ["story-seed"], writable: ["story-seed"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [] });
    await writeProjectCapabilityManifest(root, original);
    const next = createProjectCapabilityManifest({ projectId: "demo", schemaVersion: "v1", enabledSlices: ["story-seed", "runtime"], readable: ["story-seed", "runtime"], writable: ["story-seed", "runtime"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [] });
    await expect(writeProjectCapabilityManifest(root, next)).rejects.toThrow("CAPABILITY_MANIFEST_EXPECTED_FINGERPRINT_REQUIRED");
    await expect(writeProjectCapabilityManifest(root, next, "0".repeat(64))).rejects.toThrow("CAPABILITY_MANIFEST_STALE");
    await expect(writeProjectCapabilityManifest(root, next, original.fingerprint)).resolves.toEqual(next);
  });
});
