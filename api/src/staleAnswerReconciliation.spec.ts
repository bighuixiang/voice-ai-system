import { describe, expect, it } from "vitest";
import { reconcileOfflineAnswer } from "./staleAnswerReconciliation.js";

describe("stale answer reconciliation", () => {
  it("keeps an answer to replaced Q1 pending and never binds it to similar Q2", () => {
    const result = reconcileOfflineAnswer({ submittedQuestion: { questionId: "q1", version: 1, text: "两人的关系？", status: "active" }, answerText: "师兄妹", currentQuestions: [{ questionId: "q1", version: 1, text: "两人的关系？", status: "superseded" }, { questionId: "q2", version: 1, text: "两人的关系如何影响剧情？", status: "active" }] });
    expect(result).toMatchObject({ status: "pending_reconciliation", questionId: "q1", difference: { reason: "QUESTION_REPLACED" } });
    expect(result).not.toHaveProperty("currentQuestionId", "q2");
  });

  it("reports a version difference instead of applying a stale answer", () => {
    const result = reconcileOfflineAnswer({ submittedQuestion: { questionId: "q1", version: 1, text: "关系？", status: "active" }, answerText: "A", currentQuestions: [{ questionId: "q1", version: 2, text: "关系及后果？", status: "active" }] });
    expect(result).toMatchObject({ status: "pending_reconciliation", difference: { reason: "QUESTION_VERSION_STALE", currentQuestionId: "q1" } });
  });
});
