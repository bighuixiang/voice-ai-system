import { describe, expect, it } from "vitest";
import { createBackupSlice, restoreIsolated, settleDisasterRecovery, verifyBackupCatalog } from "./backupRecoveryGates.js";
describe("backup recovery gates", () => {
  it("rejects mixed tree/database backup cuts", () => { expect(createBackupSlice({ fence: true, canonCursor: "t2", treeBefore: "a", treeAfter: "b", dbSnapshot: "db", dbCursor: "t2", supportFiles: true }).retry).toBe(true); });
  it("requires decryptable complete verified backup chain", () => { expect(verifyBackupCatalog({ decryptable: true, parentComplete: true, restored: true, replicas: 1, rpoBehind: false, secretIncluded: false }).verified).toBe(false); });
  it("keeps isolated restore degraded when external material is missing", () => { expect(restoreIsolated({ stableIds: true, tasksFenced: true, externalMissing: true, writesOriginal: false, drillReceipt: true })).toMatchObject({ status: "degraded", isolated: true }); });
  it("requires staged validation and author approval for forward recovery commit", () => { expect(settleDisasterRecovery({ verifiedPoint: "b1", workerFenced: true, stagedValidated: false, authorApproved: true, currentProtected: true }).status).toBe("blocked"); });
});
