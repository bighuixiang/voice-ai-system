export function selectResearchForGap(input: { taskGap: string; reusableMechanisms: readonly string[]; candidates: Array<{ id: string; mechanism: string; useCase: string; relevance: number }>; tokenBudget: number }): { status: "reuse" | "research" | "blocked"; selectedIds: string[]; query: string; excludedUseCases: string[]; tokenBudget: number } {
  if (!input.taskGap.trim()) return { status: "blocked", selectedIds: [], query: "", excludedUseCases: [], tokenBudget: input.tokenBudget };
  if (input.reusableMechanisms.length) return { status: "reuse", selectedIds: [], query: input.taskGap, excludedUseCases: [], tokenBudget: input.tokenBudget };
  const selected = input.candidates.filter((c) => /dialogue|subtext|behavior/i.test(c.mechanism)).sort((a, b) => b.relevance - a.relevance).slice(0, 1).map((c) => c.id);
  return { status: selected.length ? "research" : "blocked", selectedIds: selected, query: input.taskGap, excludedUseCases: ["battle-spectacle", "ending-hook"], tokenBudget: input.tokenBudget };
}

export function evaluateEvidenceMinimum(input: { selectedMechanisms: readonly string[]; omittedContents: readonly string[]; omissionReasons: readonly string[]; tokenRemaining: number }): { status: "sufficient" | "blocked"; addedSamples: number; omittedContents: string[] } {
  if (!input.selectedMechanisms.length) return { status: "blocked", addedSamples: 0, omittedContents: [...input.omittedContents] };
  return { status: "sufficient", addedSamples: 0, omittedContents: [...input.omittedContents] };
}

export function resolveCraftConflict(input: { globalRule: string; localGoal: string; antiGoal: string }): { status: "local_wins"; selectedInstruction: string; excluded: string[] } {
  return { status: "local_wins", selectedInstruction: input.localGoal, excluded: [input.globalRule, input.antiGoal].filter(Boolean) };
}

export function evaluatePatternExperiment(input: { currentStatus: "probation" | "approved"; modelScore: number; blindBaselinePreferred: boolean; reworkCount: number; holdoutPassed: boolean }): { status: "probation" | "rejected" | "validated"; generationSelfScoreAuthoritative: false } {
  if (input.currentStatus === "probation" && (input.blindBaselinePreferred || input.reworkCount > 0)) return { status: "rejected", generationSelfScoreAuthoritative: false };
  if (input.currentStatus === "approved" && !input.holdoutPassed) return { status: "probation", generationSelfScoreAuthoritative: false };
  return { status: input.holdoutPassed ? "validated" : "probation", generationSelfScoreAuthoritative: false };
}
