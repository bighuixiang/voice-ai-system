import { describe, expect, it } from "vitest";
import { assessAttachmentEvidence, classifyAmbiguity, classifyReaderHypothesis, evaluateExperienceContract, evaluateReaderPayoffEvidence, preserveCompetingReaderQuestions, sealColdRead, separateEmotionAndReaderImpact, settleCuriosity } from "./experienceDecisionGates.js";
describe("experience decision gates", () => {
  it("does not require not-targeted dimensions to rise", () => { expect(evaluateExperienceContract({ targeted: ["relationship"], notTargeted: ["tension"], observed: { relationship: true, tension: false } }).passed).toBe(true); });
  it("keeps reader preference as non-canon hypothesis", () => { expect(classifyReaderHypothesis({ claim: "moving", evidenceRefs: ["cold-1"], confidence: .8 })).toMatchObject({ canon: false, calibrated: true }); });
  it("invalidates cold read with future leakage", () => { expect(sealColdRead({ visibleProgress: 20, maxProgress: 10, leakedFuture: true }).valid).toBe(false); });
  it("preserves competing reader explanations", () => { expect(preserveCompetingReaderQuestions({ questions: [{ id: "q1", support: ["a"], counter: ["b"] }, { id: "q2", support: [], counter: ["c"] }] }).questions).toHaveLength(2); });
  it("separates intentional hiding from confused staging", () => { expect(classifyAmbiguity({ intentionallyHidden: true, positionClear: false, actionClear: true, chronologyClear: true })).toMatchObject({ hidden: true, confused: true, targetedFix: true }); });
  it("requires desire choice and cost for attachment", () => { expect(assessAttachmentEvidence({ visibleDesire: false, meaningfulChoice: true, cost: true, wins: 5 }).supported).toBe(false); });
  it("does not equate declared emotion with reader impact", () => { expect(separateEmotionAndReaderImpact({ emotionDeclared: true, eventEvidence: false, relationalAccumulation: false, consequentialChoice: false }).readerImpact).toBe(false); });
  it("settles curiosity with a local answer that changes judgment", () => { expect(settleCuriosity({ openAnswers: 8, answeredLocally: true, changesJudgment: true })).toMatchObject({ debt: 7, partialSettlement: true }); });
  it("requires changed text evidence for payoff", () => { expect(evaluateReaderPayoffEvidence({ changedKeys: [], evidenceRef: "scene-1" }).status).toBe("missed"); });
});
