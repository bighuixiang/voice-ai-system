import { describe, expect, it } from "vitest";
import { createRunCheckpoint, planCheckpointRecovery } from "./runCheckpoint.js";

describe("run checkpoint recovery", () => {
  it("creates a fingerprinted stable boundary without copying prose", () => {
    const checkpoint = createRunCheckpoint({
      bookRunId: "book-1", workItemId: "w-1", stage: "planning", workGraphFingerprint: "graph-1",
      assetFingerprint: "asset-1", invocationFingerprint: "call-1", mutationPlanFingerprint: "none",
      reusableArtifactRefs: ["outline:1"], stableAt: "2026-07-31T00:00:00.000Z",
    });
    expect(checkpoint).toMatchObject({ schemaVersion: "run-checkpoint.v1", stage: "planning", reusableArtifactRefs: ["outline:1"] });
    expect(checkpoint).not.toHaveProperty("prose");
    expect(checkpoint.fingerprint).toHaveLength(64);
  });

  it("reruns interrupted read-only planning", () => {
    expect(planCheckpointRecovery({ stage: "planning", providerCharged: false, canonCommitted: false, mutationOpen: false })).toMatchObject({ action: "rerun-readonly", resultKnowledge: "known" });
  });

  it("marks a charged call without a result as unknown instead of retrying blindly", () => {
    expect(planCheckpointRecovery({ stage: "model-call", providerCharged: true, canonCommitted: false, mutationOpen: false })).toMatchObject({ action: "manual-review", resultKnowledge: "unknown" });
  });

  it("rebuilds projections after canon commit and rolls back an open mutation", () => {
    expect(planCheckpointRecovery({ stage: "settlement", providerCharged: true, canonCommitted: true, mutationOpen: false }).action).toBe("rebuild-projection");
    expect(planCheckpointRecovery({ stage: "settlement", providerCharged: false, canonCommitted: false, mutationOpen: true }).action).toBe("rollback-mutation");
  });
});
