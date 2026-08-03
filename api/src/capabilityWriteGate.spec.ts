import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCapabilityDependencyProof, createProjectCapabilityManifest } from "./deliveryGovernance.js";
import { writeCapabilityDependencyProof } from "./capabilityDependencyStore.js";
import { assertCapabilityWriteAllowed } from "./capabilityWriteGate.js";
import { writeProjectCapabilityManifest } from "./projectCapabilityManifest.js";

describe("capability write gate", () => {
  it("requires a satisfied dependency proof after manifest authorization", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "capability-write-gate-"));
    const manifest = createProjectCapabilityManifest({ projectId: "demo", schemaVersion: "v1", enabledSlices: ["runtime"], readable: ["runtime"], writable: ["runtime"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [] });
    await writeProjectCapabilityManifest(root, manifest);
    await expect(assertCapabilityWriteAllowed(root, "demo", "runtime")).rejects.toThrow("CAPABILITY_DEPENDENCY_REQUIRED:runtime");
    const blocked = createCapabilityDependencyProof({ projectSlug: "demo", sliceId: "runtime", requiredKernels: [{ id: "K0", version: "v1", verifiedBy: ["test"] }], writeAuthority: "runtime-store", unmet: ["provider"] });
    await writeCapabilityDependencyProof(root, blocked);
    await expect(assertCapabilityWriteAllowed(root, "demo", "runtime")).rejects.toThrow("CAPABILITY_DEPENDENCY_BLOCKED:runtime");
    const satisfied = createCapabilityDependencyProof({ projectSlug: "demo", sliceId: "runtime", requiredKernels: [{ id: "K0", version: "v1", verifiedBy: ["test"] }], writeAuthority: "runtime-store", unmet: [] });
    await writeCapabilityDependencyProof(root, satisfied, blocked.fingerprint);
    await expect(assertCapabilityWriteAllowed(root, "demo", "runtime")).resolves.toBeUndefined();
  });
});
