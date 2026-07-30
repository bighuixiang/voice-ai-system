import { describe, expect, it } from "vitest";
import { createEvidenceRepairPlan } from "./proseRepairPlanV2.js";

const base = { projectSlug: "demo", candidateId: "candidate-1", maturity: "validated" as const, issues: [{ issueId: "i1", value: 0.9, evidenceRefs: ["review://i1"], targetEvidence: "补足选择后果" }, { issueId: "i2", value: 0.7, evidenceRefs: ["review://i2"], targetEvidence: "修复接缝" }, { issueId: "i3", value: 0.6, evidenceRefs: ["review://i3"], targetEvidence: "减少说明" }, { issueId: "i4", value: 0.5, evidenceRefs: ["review://i4"], targetEvidence: "其他" }], immutableItems: ["author-lock-1"], affectedSegmentIds: ["segment-1"], verificationMethod: "dossier-regression", sourceRefs: ["dossier://1"] };
describe("evidence-driven prose repair plan", () => {
  it("selects at most three highest-value issues and records rollback", () => { const plan = createEvidenceRepairPlan(base); expect(plan.selectedIssueIds).toEqual(["i1", "i2", "i3"]); expect(plan.rollbackPoint).toMatch(/^rollback-/); expect(plan.canonWrite).toBe(false); });
  it("keeps accepted/settled/publication prose isolated and requires evidence", () => { const plan = createEvidenceRepairPlan({ ...base, maturity: "settled" }); expect(plan.mode).toBe("isolated-revision-candidate"); expect(plan.canonWrite).toBe(false); expect(() => createEvidenceRepairPlan({ ...base, issues: [] })).toThrow("REPAIR_ISSUES_REQUIRED"); });
  it("rejects plans with too many selected issues or missing immutable protections", () => { expect(() => createEvidenceRepairPlan({ ...base, issues: base.issues.slice(0, 1), immutableItems: [] })).toThrow("REPAIR_IMMUTABLE_REQUIRED"); });
});
