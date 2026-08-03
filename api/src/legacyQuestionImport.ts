export interface ImportedQuestion { questionId: string; text: string; status: "candidate"; sourceRef: string; blocking: false; activated: false; decisionId: null; }
export function importLegacyQuestions(input: { taskId: string; questions: readonly string[] }): ImportedQuestion[] {
  if (!input.taskId.trim()) throw new Error("LEGACY_QUESTION_TASK_REQUIRED");
  return input.questions.filter((text) => text.trim()).map((text, index) => ({ questionId: `legacy-${input.taskId}-${index + 1}`, text: text.trim(), status: "candidate" as const, sourceRef: `task://${input.taskId}/questions/${index + 1}`, blocking: false as const, activated: false as const, decisionId: null }));
}
