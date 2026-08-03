export function classifyQuestionCapability(input: { capabilityQuestionStrings: readonly string[]; hasDialogueQuestionSchema: boolean }): { status: "legacy-only" | "partner-question-capable"; partnerWaitingUi: boolean; answerApiEnabled: boolean } {
  const capable = input.hasDialogueQuestionSchema;
  return { status: capable ? "partner-question-capable" : "legacy-only", partnerWaitingUi: capable, answerApiEnabled: capable };
}
