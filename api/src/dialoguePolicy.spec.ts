import { describe, expect, it } from "vitest";
import { rankDialogueQuestions, renderNonLeadingQuestion, createProvisionalAssumption, createDelegationGrant } from "./dialoguePolicy.js";

describe("dialogue policy safeguards", () => {
  it("ranks by high-impact uncertainty reduction over author burden", () => {
    const result = rankDialogueQuestions([{ questionId: "q-low", ambiguity: 0.9, errorCost: 0.1, impact: 0.1, reversibility: 0.9, delayCost: 0.1, evidenceCoverage: 0.8, authorBurden: 0.5 }, { questionId: "q-high", ambiguity: 0.6, errorCost: 1, impact: 1, reversibility: 0.1, delayCost: 0.8, evidenceCoverage: 0.1, authorBurden: 0.2 }]);
    expect(result.activeQuestionId).toBe("q-high");
  });

  it("renders distinguishable options without coercive wording and allows free answer", () => {
    const question = renderNonLeadingQuestion({ questionId: "q-1", knownEvidence: ["the door is unexplained"], whyNow: "opening structure depends on it", options: [{ label: "portal", impact: "world rule" }, { label: "wreck", impact: "mystery" }], recommendation: "portal" });
    expect(question.options).toHaveLength(2);
    expect(question.freeAnswerAllowed).toBe(true);
    expect(question.recommendation).toBe("portal");
  });

  it("bounds provisional assumptions and delegation grants", () => {
    const assumption = createProvisionalAssumption({ assumptionId: "a-1", basis: "genre preference", assets: ["chapter-1"], allowedActions: ["draft"], expiry: "chapter-1-approved", risk: "minor tone drift", revocationRoute: "recompile" });
    expect(assumption.status).toBe("provisional");
    expect(() => createProvisionalAssumption({ assumptionId: "a-2", basis: "genre", assets: ["ending"], allowedActions: ["change-ending"], expiry: "never", risk: "high", revocationRoute: "none" })).toThrow("PROVISIONAL_SCOPE_FORBIDDEN");
    const grant = createDelegationGrant({ grantId: "g-1", scope: ["temporary-pov"], expiresAt: "2026-08-01T00:00:00Z", rationale: "author said you decide", revocable: true });
    expect(grant.revocable).toBe(true);
  });
});
