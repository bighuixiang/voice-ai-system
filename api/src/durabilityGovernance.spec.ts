import { describe, expect, it } from "vitest";
import { createBackupPolicy, createBackupVerification, createRestorePlan, settleRecovery } from "./durabilityGovernance.js";

describe("durability governance", () => {
  it("declares RPO/RTO, retention and fault-domain policy", () => {
    const policy = createBackupPolicy({ policyId: "p-1", rpoMinutes: 15, rtoMinutes: 60, retention: ["daily", "release"], faultDomain: "offsite", encryption: "managed-key", excluded: ["model-cache"] });
    expect(policy.rpoMinutes).toBe(15);
    expect(policy.faultDomain).toBe("offsite");
  });

  it("verifies manifest, object readability, schema compatibility and isolated restore", () => {
    const result = createBackupVerification({ backupId: "b-1", manifestHash: "m1", observedManifestHash: "m1", objectsReadable: true, parentChainValid: true, decryptionAllowed: true, schemaCompatible: true, crossReferencesValid: true, isolatedRestorePassed: true, workersStarted: false, externalMessagesSent: false });
    expect(result.status).toBe("verified");
  });

  it("creates a reviewable restore plan that pauses work", () => {
    const plan = createRestorePlan({ planId: "r-1", backupId: "b-1", mode: "point-in-time", expectedLossWindow: "5 minutes", conflicts: ["local draft"], externalGaps: ["source unavailable"], fenceWorkers: ["task-1"], rollbackPoint: "commit-1" });
    expect(plan.workerAction).toBe("pause");
  });

  it("issues RecoverySettlement only after all integrity checks pass", () => {
    const settlement = settleRecovery({ planId: "r-1", projectTreeValid: true, databaseValid: true, lineageValid: true, permissionsValid: true, projectionsFresh: true, obligationProofsValid: true, authorSampleChecked: true });
    expect(settlement.status).toBe("settled");
  });
});
