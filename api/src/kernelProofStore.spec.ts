import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createKernelProof } from "./kernelGovernance.js";
import { readKernelProof, writeKernelProof } from "./kernelProofStore.js";

describe("kernel proof store", () => {
  it("round-trips project-scoped proofs and enforces read-only unknown-version policy", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kernel-proof-"));
    const proof = createKernelProof({ projectSlug: "demo", kernelId: "K0-contract", version: "v1", schemaRefs: ["story-seed.v1"], runtimeValidators: ["storySeed.spec.ts"], generatedTypes: ["StorySeedFrame"], capabilityManifestRef: "manifest-1", readWriteMatrixRef: "matrix-1", negotiatedVersions: ["v1"], unknownVersionPolicy: "read-only" });
    await writeKernelProof(root, proof);
    await expect(readKernelProof(root, "K0-contract", "demo")).resolves.toEqual(proof);
    await expect(readKernelProof(root, "K0-contract", "other")).rejects.toThrow("KERNEL_PROOF_INVALID");
  });
});
