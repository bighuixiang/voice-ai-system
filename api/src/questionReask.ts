export interface ReaskQuestion {
  questionId: string;
  text: string;
  premise: string;
  premiseEvidenceRefs: string[];
  reaskCount: number;
}

export interface ReaskResult {
  question: ReaskQuestion;
  previousPremise: string;
  newPremise: string;
  context: { premise: string; evidenceRefs: string[] };
}

export function reaskWithNewPremise(input: {
  previous: ReaskQuestion;
  text: string;
  newPremise: string;
  premiseEvidenceRefs: readonly string[];
}): ReaskResult {
  if (!input.text.trim() || !input.newPremise.trim()) throw new Error("REASK_FIELDS_REQUIRED");
  const refs = [...new Set(input.premiseEvidenceRefs.map((ref) => ref.trim()).filter(Boolean))];
  if (!refs.length) throw new Error("REASK_PREMISE_EVIDENCE_REQUIRED");
  if (input.newPremise.trim() === input.previous.premise.trim()) throw new Error("REASK_NEW_PREMISE_REQUIRED");
  const question = { questionId: input.previous.questionId, text: input.text.trim(), premise: input.newPremise.trim(), premiseEvidenceRefs: refs, reaskCount: input.previous.reaskCount + 1 };
  return { question, previousPremise: input.previous.premise, newPremise: question.premise, context: { premise: question.premise, evidenceRefs: refs } };
}
