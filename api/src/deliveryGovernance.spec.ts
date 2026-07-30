import { describe, expect, it } from "vitest";
import { createProjectCapabilityManifest, createCapabilityDependencyProof, createRequirementEvidenceLink, enforceSingleWriteAuthority } from "./deliveryGovernance.js";

describe("delivery governance", () => {
  it("gates UI/API/worker from one project capability manifest", () => {
    const manifest = createProjectCapabilityManifest({ projectId: "demo", schemaVersion: "v1", enabledSlices: ["story-seed"], readable: ["story-seed"], writable: ["story-seed"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [] });
    expect(manifest.writable).toContain("story-seed");
  });

  it("proves dependencies before allowing a slice write", () => {
    const proof = createCapabilityDependencyProof({ sliceId: "v5-writing", requiredKernels: [{ id: "K2-candidate", version: "v1", verifiedBy: ["candidate.spec.ts"] }], writeAuthority: "candidate-store", unmet: [] });
    expect(proof.status).toBe("satisfied");
  });

  it("tracks requirement evidence status instead of inferring completion from files", () => {
    const link = createRequirementEvidenceLink({ requirementId: "FR-READER-001", sliceId: "reader-contract", contractRefs: ["reader-experience-contract.v1"], tests: ["readerExperience.spec.ts"], fixtures: ["demo-reader"], metrics: ["payoff-change-rate"], releaseEvidence: [], status: "implemented" });
    expect(link.status).toBe("implemented");
  });

  it("rejects competing write authorities for one semantic", () => {
    expect(enforceSingleWriteAuthority({ semantic: "story-contract", authorities: ["contract-store"] }).status).toBe("valid");
    expect(() => enforceSingleWriteAuthority({ semantic: "story-contract", authorities: ["legacy-api", "contract-store"] })).toThrow("MULTIPLE_WRITE_AUTHORITIES");
  });
});
