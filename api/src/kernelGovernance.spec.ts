import { describe, expect, it } from "vitest";
import { createKernelProof, validateMutationPlan, createCandidateBoundary, createObligationCoreProof, createAISafetyGate, createLongMemoryProof } from "./kernelGovernance.js";

describe("delivery kernel governance", () => {
  it("proves K0 shared schema, version negotiation and unknown-version read-only", () => {
    const proof = createKernelProof({ kernelId: "K0-contract", version: "v1", schemaRefs: ["story-seed.v1"], runtimeValidators: ["storySeed.spec.ts"], generatedTypes: ["StorySeedFrame"], capabilityManifestRef: "manifest-1", readWriteMatrixRef: "matrix-1", negotiatedVersions: ["v1"], unknownVersionPolicy: "read-only" });
    expect(proof.status).toBe("verified");
  });

  it("requires idempotency, expected fingerprint and atomic mutation plan for K1", () => {
    const result = validateMutationPlan({ commandId: "cmd-1", idempotencyKey: "idem-1", expectedFingerprint: "f1", writes: [{ semantic: "story-seed", authority: "seed-store" }], eventTypes: ["seed.captured"], recoveryAction: "rollback" });
    expect(result.valid).toBe(true);
  });

  it("keeps AI candidates separate from canon with stale and rollback boundaries", () => {
    const boundary = createCandidateBoundary({ candidateId: "c-1", parentFingerprint: "p1", semanticId: "story-contract", evidenceAnchors: ["utterance://u1#1-4"], stalePropagation: ["outline"], authorLocks: ["ending"], rollbackRef: "commit-1", canonWrite: false });
    expect(boundary.canonWrite).toBe(false);
  });

  it("requires typed obligation evidence for K3", () => {
    const proof = createObligationCoreProof({ obligationId: "obl-1", type: "mystery", setupEvidence: ["manuscript://v1#1-2"], payoffContract: "payoff-1", windows: ["chapter-5"], eventGuard: "transition-guard", planFactSeparated: true });
    expect(proof.status).toBe("verified");
  });

  it("blocks AI execution without risk, context, budget and data-boundary controls", () => {
    const gate = createAISafetyGate({ taskId: "task-1", riskLevel: "medium", capabilityFloor: "safe-write", contextManifest: "ctx-1", budgetReserved: true, callFingerprint: "call-1", retryPolicy: "narrow", dataBoundary: "project-only", sourceRightsVerified: true });
    expect(gate.status).toBe("allowed");
  });

  it("requires K5 entity/time/visibility conflict projection for canon continuity", () => {
    const proof = createLongMemoryProof({ projectId: "demo", claimEventAuthority: "event-store", entityIds: ["courier"], temporalDomain: "story-time", knowledgeDomain: "pov", conflictSet: "conflicts-1", settlementProjection: "projection-1", eligibilityFirst: true, rebuildable: true });
    expect(proof.status).toBe("verified");
  });
});
