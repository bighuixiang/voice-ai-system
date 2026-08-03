import { describe, expect, it } from "vitest";
import { closeQuestionsWithEvidence } from "./answerEvidenceClosure.js";

describe("answer evidence closure", () => {
  const questions = [
    { questionId: "q-pace", status: "open" as const, requiredEvidenceRefs: ["utterance://m-1#pace"] },
    { questionId: "q-villain", status: "open" as const, requiredEvidenceRefs: ["utterance://m-2#villain"] },
  ];

  it("closes only the answered question when its evidence span is present", () => {
    const result = closeQuestionsWithEvidence({ questions, answer: { questionId: "q-pace", text: "慢一点", evidenceRefs: ["utterance://m-1#pace"] } });
    expect(result.closedQuestionId).toBe("q-pace");
    expect(result.questions.map((question) => [question.questionId, question.status])).toEqual([["q-pace", "closed"], ["q-villain", "open"]]);
  });

  it("keeps the question open when the answer has no matching evidence", () => {
    const result = closeQuestionsWithEvidence({ questions, answer: { questionId: "q-pace", text: "慢一点", evidenceRefs: ["utterance://m-9#pace"] } });
    expect(result.closedQuestionId).toBeNull();
    expect(result.reason).toBe("REQUIRED_EVIDENCE_NOT_COVERED");
    expect(result.questions.every((question) => question.status === "open")).toBe(true);
  });

  it("does not accept an empty evidence list", () => {
    expect(() => closeQuestionsWithEvidence({ questions, answer: { questionId: "q-pace", text: "慢一点", evidenceRefs: [] } })).toThrow("ANSWER_EVIDENCE_REQUIRED");
  });
});
