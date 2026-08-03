export function attributePartialAdoption(input: { candidateId: string; keptDimensions: readonly string[]; rejectedDimensions: readonly string[]; authorRewrite: string }): { candidateId: string; status: "partial"; structuralEvidence: string[]; nonAdoptedEvidence: string[]; authorText: string; activePreferenceEligible: false } {
  if (!input.candidateId.trim() || !input.keptDimensions.length || !input.rejectedDimensions.length || !input.authorRewrite.trim()) throw new Error("PARTIAL_ADOPTION_FIELDS_REQUIRED");
  return { candidateId: input.candidateId, status: "partial", structuralEvidence: [...input.keptDimensions], nonAdoptedEvidence: [...input.rejectedDimensions], authorText: input.authorRewrite, activePreferenceEligible: false };
}
