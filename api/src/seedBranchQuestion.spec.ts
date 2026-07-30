import { describe, expect, it } from "vitest";
import { evaluateSeedBranchQuestion, createSeedContractCandidates } from "./seedBranchQuestion.js";

describe("seed branch questions and candidates", () => {
  it("activates a question only when answers materially eliminate branches", () => {
    const result = evaluateSeedBranchQuestion({ questionId: "q-1", answers: [{ answer: "portal", affectedFields: ["worldRule"], branchSignature: "portal" }, { answer: "wreck", affectedFields: ["mystery"], branchSignature: "wreck" }], ignoredQuestions: ["hero-name"] });
    expect(result.active).toBe(true);
    expect(result.expectedInformationGain).toBeGreaterThan(0);
    expect(result.whyNotAsked).toContain("hero-name");
  });

  it("deactivates a question when all counterfactual answers produce the same plan", () => {
    const result = evaluateSeedBranchQuestion({ questionId: "q-2", answers: [{ answer: "red", affectedFields: ["tone"], branchSignature: "same" }, { answer: "blue", affectedFields: ["tone"], branchSignature: "same" }] });
    expect(result.active).toBe(false);
    expect(result.reason).toBe("NO_MATERIAL_DIFFERENCE");
  });

  it("keeps candidate differences attributable and bounded", () => {
    const result = createSeedContractCandidates({ sharedFacts: ["courier"], candidates: [{ candidateId: "c-1", assumptions: ["portal"], resolvedUnknowns: ["door"], causalCommitments: ["world-rule"], reworkIfWrong: "rewrite opening" }, { candidateId: "c-2", assumptions: ["wreck"], resolvedUnknowns: ["door"], causalCommitments: ["mystery"], reworkIfWrong: "rewrite reveal" }] });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.sharedFacts).toContain("courier");
  });
});
