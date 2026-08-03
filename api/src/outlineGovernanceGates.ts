export function evaluateOutlineCandidateAdoption(input: { candidates: Array<{ id: string; status: "pending" | "accepted" | "rejected" }>; selectedId?: string; affectedClosureComplete: boolean }): { status: "unchanged" | "adopted" | "blocked"; canonCandidateIds: string[]; rejectedVisibleToGeneration: string[]; auditIds: string[] } {
  const selected = input.selectedId ? input.candidates.find((candidate) => candidate.id === input.selectedId) : undefined;
  if (!selected) return { status: "unchanged", canonCandidateIds: [], rejectedVisibleToGeneration: [], auditIds: input.candidates.map((candidate) => candidate.id) };
  if (!input.affectedClosureComplete) return { status: "blocked", canonCandidateIds: [], rejectedVisibleToGeneration: [], auditIds: input.candidates.map((candidate) => candidate.id) };
  return { status: "adopted", canonCandidateIds: [selected.id], rejectedVisibleToGeneration: input.candidates.filter((candidate) => candidate.id !== selected.id).map((candidate) => candidate.id), auditIds: input.candidates.map((candidate) => candidate.id) };
}

export function compareStructureCandidates(input: Array<{ id: string; agency: string; pacing: string; fairness: string; payoffDifficulty: string; length: string; impactSubgraph: string }>): { status: "distinct" | "duplicate"; duplicateIds: string[] } {
  const signatures = new Map<string, string>(); const duplicateIds: string[] = [];
  for (const candidate of input) { const signature = [candidate.agency, candidate.pacing, candidate.fairness, candidate.payoffDifficulty, candidate.length, candidate.impactSubgraph].join("|"); if (signatures.has(signature)) duplicateIds.push(candidate.id); else signatures.set(signature, candidate.id); }
  return { status: duplicateIds.length ? "duplicate" : "distinct", duplicateIds };
}

export function validateStaticOutline(input: { foreshadowChapter: number; payoffChapter: number; newRulesInEnding: boolean; modelSelfScore: number }): { status: "valid" | "blocked"; issues: string[]; repairCandidates: string[] } {
  const issues = [...(input.payoffChapter < input.foreshadowChapter ? ["PAYOFF_BEFORE_FORESHADOW"] : []), ...(input.newRulesInEnding ? ["ENDING_NEW_RULE"] : [])];
  return { status: issues.length ? "blocked" : "valid", issues, repairCandidates: issues.length ? ["move_payoff_after_seed", "seed_rule_earlier", "replace_ending_mechanism"] : [] };
}

export function preserveSemanticReferences(input: { oldNodeId: string; insertedChapterNumber: number; oldChapterNumber: number; references: Array<{ kind: string; nodeId: string }> }): { displayChapterNumber: number; semanticNodeId: string; referencesStable: boolean } {
  return { displayChapterNumber: input.oldChapterNumber >= input.insertedChapterNumber ? input.oldChapterNumber + 1 : input.oldChapterNumber, semanticNodeId: input.oldNodeId, referencesStable: input.references.every((reference) => reference.nodeId === input.oldNodeId) };
}

export function planImpactSubgraph(input: { direct: readonly string[]; transitive: readonly string[]; unknown: readonly string[]; protected: readonly string[]; unaffected: readonly string[]; l2DecisionRequired: boolean }): { status: "minimal" | "needs_l2"; affected: string[]; protectedNodes: string[]; rollbackPoint: string } {
  return { status: input.l2DecisionRequired ? "needs_l2" : "minimal", affected: [...new Set([...input.direct, ...input.transitive, ...input.unknown])], protectedNodes: [...input.protected, ...input.unaffected], rollbackPoint: "pre-change-canon" };
}

export function settleEmergenceCandidate(input: { accepted: boolean; changesCoreConflict: boolean; changesCharacterFate: boolean; authorization: boolean; validation: boolean }): { status: "non_canon" | "blocked" | "adopted"; futureFactVisible: boolean } {
  if (!input.accepted) return { status: "non_canon", futureFactVisible: false };
  if (input.changesCoreConflict || input.changesCharacterFate || !input.authorization || !input.validation) return { status: "blocked", futureFactVisible: false };
  return { status: "adopted", futureFactVisible: true };
}
