export interface ReconciliationQuestion { questionId: string; version: number; text: string; status: "active" | "answered" | "superseded"; }
export interface ReconciliationResult { status: "pending_reconciliation" | "accepted"; questionId: string; answerText: string; difference?: { submittedQuestionId: string; currentQuestionId?: string; reason: "QUESTION_REPLACED" | "QUESTION_VERSION_STALE" }; }

export function reconcileOfflineAnswer(input: { submittedQuestion: ReconciliationQuestion; answerText: string; currentQuestions: readonly ReconciliationQuestion[] }): ReconciliationResult {
  if (!input.answerText.trim()) throw new Error("STALE_ANSWER_REQUIRED");
  const submitted = input.submittedQuestion;
  const current = input.currentQuestions.find((question) => question.questionId === submitted.questionId);
  if (!current || current.status === "superseded") return { status: "pending_reconciliation", questionId: submitted.questionId, answerText: input.answerText.trim(), difference: { submittedQuestionId: submitted.questionId, reason: "QUESTION_REPLACED" } };
  if (current.version !== submitted.version) return { status: "pending_reconciliation", questionId: submitted.questionId, answerText: input.answerText.trim(), difference: { submittedQuestionId: submitted.questionId, currentQuestionId: current.questionId, reason: "QUESTION_VERSION_STALE" } };
  return { status: "accepted", questionId: submitted.questionId, answerText: input.answerText.trim() };
}
