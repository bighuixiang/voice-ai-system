export interface EvidenceQuestion {
  questionId: string;
  status: "open" | "closed";
  requiredEvidenceRefs: string[];
}

export interface EvidenceBackedAnswer {
  questionId: string;
  text: string;
  evidenceRefs: string[];
}

export function closeQuestionsWithEvidence(input: {
  questions: readonly EvidenceQuestion[];
  answer: EvidenceBackedAnswer;
}): { questions: EvidenceQuestion[]; closedQuestionId: string | null; reason?: string } {
  if (!input.answer.questionId.trim() || !input.answer.text.trim()) throw new Error("ANSWER_EVIDENCE_FIELDS_REQUIRED");
  if (!input.answer.evidenceRefs.length) throw new Error("ANSWER_EVIDENCE_REQUIRED");
  const target = input.questions.find((question) => question.questionId === input.answer.questionId);
  if (!target) throw new Error("ANSWER_QUESTION_NOT_FOUND");
  const refs = new Set(input.answer.evidenceRefs.map((ref) => ref.trim()).filter(Boolean));
  if (!target.requiredEvidenceRefs.every((ref) => refs.has(ref))) {
    return { questions: input.questions.map((question) => ({ ...question, requiredEvidenceRefs: [...question.requiredEvidenceRefs] })), closedQuestionId: null, reason: "REQUIRED_EVIDENCE_NOT_COVERED" };
  }
  return {
    questions: input.questions.map((question) => question.questionId === target.questionId ? { ...question, status: "closed" as const, requiredEvidenceRefs: [...question.requiredEvidenceRefs] } : { ...question, requiredEvidenceRefs: [...question.requiredEvidenceRefs] }),
    closedQuestionId: target.questionId,
  };
}
