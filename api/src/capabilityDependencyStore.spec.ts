import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCapabilityDependencyProof } from "./deliveryGovernance.js";
import { readCapabilityDependencyProof, writeCapabilityDependencyProof } from "./capabilityDependencyStore.js";

describe("capability dependency proof store", () => {
  it("round-trips project-scoped blocked proofs and rejects cross-project reads", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "capability-dependency-"));
    const proof = createCapabilityDependencyProof({ projectSlug: "demo", sliceId: "runtime", requiredKernels: [{ id: "K2", version: "v1", verifiedBy: ["test"] }], writeAuthority: "runtime-store", unmet: ["calibration"] });
    await writeCapabilityDependencyProof(root, proof);
    await expect(readCapabilityDependencyProof(root, "runtime", "demo")).resolves.toEqual(proof);
    await expect(readCapabilityDependencyProof(root, "runtime", "other")).rejects.toThrow("CAPABILITY_DEPENDENCY_INVALID");
  });

  it("requires the current fingerprint before replacing a proof", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "capability-dependency-version-"));
    const original = createCapabilityDependencyProof({ projectSlug: "demo", sliceId: "runtime", requiredKernels: [{ id: "K0", version: "v1", verifiedBy: ["test"] }], writeAuthority: "runtime-store", unmet: [] });
    await writeCapabilityDependencyProof(root, original);
    const next = createCapabilityDependencyProof({ projectSlug: "demo", sliceId: "runtime", requiredKernels: [{ id: "K0", version: "v2", verifiedBy: ["test"] }], writeAuthority: "runtime-store", unmet: ["calibration"] });
    await expect(writeCapabilityDependencyProof(root, next)).rejects.toThrow("CAPABILITY_DEPENDENCY_EXPECTED_FINGERPRINT_REQUIRED");
    await expect(writeCapabilityDependencyProof(root, next, "0".repeat(64))).rejects.toThrow("CAPABILITY_DEPENDENCY_STALE");
    await expect(writeCapabilityDependencyProof(root, next, original.fingerprint)).resolves.toEqual(next);
  });
});
