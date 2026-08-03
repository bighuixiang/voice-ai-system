import { describe, expect, it } from "vitest";
import { rankDialogueQuestions, renderNonLeadingQuestion, createProvisionalAssumption, createDelegationGrant } from "./dialoguePolicy.js";

describe("dialogue policy safeguards", () => {
  it("ranks by high-impact uncertainty reduction over author burden", () => {
    const result = rankDialogueQuestions([{ questionId: "q-low", ambiguity: 0.9, errorCost: 0.1, impact: 0.1, reversibility: 0.9, delayCost: 0.1, evidenceCoverage: 0.8, authorBurden: 0.5 }, { questionId: "q-high", ambiguity: 0.6, errorCost: 1, impact: 1, reversibility: 0.1, delayCost: 0.8, evidenceCoverage: 0.1, authorBurden: 0.2 }]);
    expect(result.activeQuestionId).toBe("q-high");
  });

  it("activates only the protagonist-goal question while keeping other gaps non-blocking", () => {
    const result = rankDialogueQuestions([
      { questionId: "protagonist-goal", ambiguity: 0.9, errorCost: 1, impact: 1, reversibility: 0.2, delayCost: 0.9, evidenceCoverage: 0, authorBurden: 0.2 },
      { questionId: "hair-color", ambiguity: 1, errorCost: 0.1, impact: 0.1, reversibility: 1, delayCost: 0, evidenceCoverage: 0, authorBurden: 0.4 },
      { questionId: "city-name", ambiguity: 0.8, errorCost: 0.1, impact: 0.1, reversibility: 1, delayCost: 0, evidenceCoverage: 0, authorBurden: 0.4 },
      { questionId: "ending-type", ambiguity: 0.7, errorCost: 0.2, impact: 0.2, reversibility: 0.8, delayCost: 0.1, evidenceCoverage: 0, authorBurden: 0.4 }
    ]);
    expect(result.activeQuestionId).toBe("protagonist-goal");
    expect(result.ranking.filter((item) => !item.skipped)).toHaveLength(1);
    expect(result.ranking.filter((item) => item.skipped).map((item) => item.questionId)).toEqual(expect.arrayContaining(["hair-color", "city-name", "ending-type"]));
  });

  it("renders distinguishable options without coercive wording and allows free answer", () => {
    const question = renderNonLeadingQuestion({ questionId: "q-1", knownEvidence: ["the door is unexplained"], whyNow: "opening structure depends on it", options: [{ label: "portal", impact: "world rule" }, { label: "wreck", impact: "mystery" }], recommendation: "portal", recommendationEvidenceRefs: ["analysis://door/1"] });
    expect(question.options).toHaveLength(2);
    expect(question.freeAnswerAllowed).toBe(true);
    expect(question.recommendation).toBe("portal");
    expect(question.uncertainOption).toBe("我不确定，请推荐");
    expect(question.recommendationEvidenceRefs).toEqual(["analysis://door/1"]);
  });

  it("rejects coercive labels and recommendations without evidence", () => {
    expect(() => renderNonLeadingQuestion({ questionId: "q-2", knownEvidence: ["x"], whyNow: "y", options: [{ label: "正确选项", impact: "显然更好" }, { label: "other", impact: "cost" }], recommendation: "正确选项", recommendationEvidenceRefs: ["x://1"] })).toThrow("DIALOGUE_QUESTION_LEADING_WORDING");
    expect(() => renderNonLeadingQuestion({ questionId: "q-3", knownEvidence: ["x"], whyNow: "y", options: [{ label: "a", impact: "benefit" }, { label: "b", impact: "cost" }], recommendation: "a" })).toThrow("DIALOGUE_RECOMMENDATION_EVIDENCE_REQUIRED");
  });

  it("bounds provisional assumptions and delegation grants", () => {
    const assumption = createProvisionalAssumption({ assumptionId: "a-1", basis: "genre preference", assets: ["chapter-1"], allowedActions: ["draft"], expiry: "chapter-1-approved", risk: "minor tone drift", revocationRoute: "recompile" });
    expect(assumption.status).toBe("provisional");
    expect(() => createProvisionalAssumption({ assumptionId: "a-2", basis: "genre", assets: ["ending"], allowedActions: ["change-ending"], expiry: "never", risk: "high", revocationRoute: "none" })).toThrow("PROVISIONAL_SCOPE_FORBIDDEN");
    const grant = createDelegationGrant({ grantId: "g-1", scope: ["temporary-pov"], expiresAt: "2026-08-01T00:00:00Z", rationale: "author said you decide", revocable: true });
    expect(grant.revocable).toBe(true);
  });
});
