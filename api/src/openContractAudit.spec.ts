import { describe, expect, it } from "vitest";
import { auditOpenContract } from "./openContractAudit.js";

describe("open contract audit", () => {
  it("blocks a sequel-hook label when the current conflict depends on the answer", () => {
    const result = auditOpenContract({ obligationId: "killer-identity", coreConflictDependsOnAnswer: true, authorMarkedSequelHook: true, fairnessEvidence: [], answeredSubclaims: [] });
    expect(result).toMatchObject({ status: "open_contract_incomplete", repairRoutes: ["close_in_current_book", "reframe_as_true_open_subquestion", "defer_explicitly_unfinished"] });
  });
  it("allows a genuinely complete open subquestion", () => {
    expect(auditOpenContract({ obligationId: "side-mystery", coreConflictDependsOnAnswer: false, authorMarkedSequelHook: true, fairnessEvidence: [], answeredSubclaims: [] }).status).toBe("audited_complete");
  });
});
