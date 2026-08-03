import { describe, expect, it } from "vitest";
import { decideEvaluationDisagreement } from "./evaluationDisagreement.js";

describe("evaluation disagreement", () => {
  it("does not manufacture a winner for a tie and scopes ordinary continuation", () => {
    const result = decideEvaluationDisagreement({ verdicts: [{ verdict: "accept", confidence: 0.7 }, { verdict: "tie", confidence: 0.5 }], impact: "ordinary", hardGatesPassed: true, authorGoalMatched: true, protectedItemRegression: false, autonomyAuthorized: true });
    expect(result).toMatchObject({ status: "uncertain", action: "continue" });
  });

  it("escalates elevated disagreement and sends critical protected disagreement to the author", () => {
    expect(decideEvaluationDisagreement({ verdicts: [{ verdict: "accept", confidence: 0.9 }, { verdict: "reject", confidence: 0.8 }], impact: "elevated", hardGatesPassed: true, authorGoalMatched: true, protectedItemRegression: false, autonomyAuthorized: true })).toMatchObject({ action: "independent-review" });
    expect(decideEvaluationDisagreement({ verdicts: [{ verdict: "accept", confidence: 0.9 }, { verdict: "reject", confidence: 0.8 }], impact: "critical", hardGatesPassed: true, authorGoalMatched: true, protectedItemRegression: true, autonomyAuthorized: true })).toMatchObject({ action: "author-choice", status: "uncertain" });
  });

  it("returns not-applicable without pretending the chapter passed", () => {
    expect(decideEvaluationDisagreement({ verdicts: [{ verdict: "not_applicable", confidence: 1 }], impact: "ordinary", hardGatesPassed: true, authorGoalMatched: true, protectedItemRegression: false, autonomyAuthorized: true })).toMatchObject({ status: "not_applicable", action: "not-applicable" });
  });
});
