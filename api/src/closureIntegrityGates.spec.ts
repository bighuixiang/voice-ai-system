import { describe, expect, it } from "vitest";
import { allocateQuestionBudget, classifyDecisionLevel, escalateDecision, evaluateFirstInput, issueClosureCertificate, issueCoverageCertificate, propagateClosureDamage, recordReversibleDefault } from "./closureIntegrityGates.js";
describe("closure integrity gates", () => {
  it("propagates deleted setup damage but ignores decorative deletion", () => { expect(propagateClosureDamage({ deletedSetup: true, linkedAnchors: ["a"], linkedClues: ["c"], readerJudgments: ["r"], affectedChapters: ["ch2"], decorativeOnly: false }).status).toBe("damaged"); expect(propagateClosureDamage({ deletedSetup: true, linkedAnchors: [], linkedClues: [], readerJudgments: [], affectedChapters: [], decorativeOnly: true }).status).toBe("unchanged"); });
  it("reports incomplete scan coverage", () => { expect(issueCoverageCertificate({ plannedAssets: 198, scannedAssets: 10, parseFailures: 3, lowConfidence: 2, obligations: 0 }).status).toBe("incomplete"); });
  it("issues bounded closure certificate", () => { expect(issueClosureCertificate({ obligationsClosed: true, openItemsAuthorized: true, sourceCoverageApproved: true, pendingCandidates: 0, auditedScope: "published-v1" })).toMatchObject({ status: "audited_complete", absoluteGuarantee: false }); });
  it("starts one-sentence journey without tool selection", () => { expect(evaluateFirstInput({ roughIdea: "courier delivers to nowhere", requiresToolChoice: false }).status).toBe("started"); });
  it("allocates one active question and one reviewable result", () => { expect(allocateQuestionBudget({ unknowns: [{ id: "a", value: 3 }, { id: "b", value: 2 }, { id: "c", value: 1 }], activeLimit: 1, reviewableLimit: 1 })).toEqual({ active: ["a"], provisional: ["b"], deferred: ["c"] }); });
  it("escalates only high-impact irreversible decision", () => { expect(escalateDecision({ impact: 0.9, errorCost: 0.9, threshold: 1, reversible: false, questionId: "kill-partner" })).toMatchObject({ status: "ask", soleBlocker: true }); });
  it("records reversible default", () => { expect(recordReversibleDefault({ field: "cafe", value: "Blue Cup", scope: "project" }).undo).toContain("rename"); });
  it("keeps ordinary detail at L0", () => { expect(classifyDecisionLevel({ uncertain: true, affectsCanon: false, affectsEnding: false, ordinaryDetail: true })).toBe("L0"); });
});
