export function quarantineUnresolvedSource(input: { sourceFamilyKnown: boolean; accessCategoryKnown: boolean; deletionStatusKnown: boolean; rawText: string; candidateCount: number; qualificationResolved: boolean }): { status: "quarantined" | "eligible"; searchable: boolean; promptEligible: boolean; snapshotRequired: boolean; isolatedCandidateCount: number } {
  const resolved = input.sourceFamilyKnown && input.accessCategoryKnown && input.deletionStatusKnown && input.qualificationResolved;
  return { status: resolved ? "eligible" : "quarantined", searchable: resolved, promptEligible: resolved, snapshotRequired: true, isolatedCandidateCount: resolved ? 0 : input.candidateCount };
}
