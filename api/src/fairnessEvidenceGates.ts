export function classifyObjectObligation(input: { mentionCount: number; characterReaction: boolean; narrativeEmphasis: boolean; causalRole: boolean; authorPromise: boolean }): { status: "decorative" | "candidate"; createsObligation: boolean; sourceRetained: true } {
  const candidate = input.authorPromise || input.characterReaction || input.narrativeEmphasis || input.causalRole || input.mentionCount > 1;
  return { status: candidate ? "candidate" : "decorative", createsObligation: candidate, sourceRetained: true };
}

export function evaluateReaderExpectation(input: { backendImportance: "high" | "low"; visibleMentions: number; sensorySpecificity: number; readerRecall: number }): { status: "fair" | "under_setup"; requiredAction: "none" | "add_setup_or_lower_payoff" } {
  const fair = input.visibleMentions >= 2 && input.sensorySpecificity >= 0.5 && input.readerRecall >= 0.5;
  return { status: fair ? "fair" : "under_setup", requiredAction: fair ? "none" : "add_setup_or_lower_payoff" };
}

export function updateHypothesisGraph(input: { hypotheses: readonly string[]; clueSupports: Record<string, string[]>; clueExcludes: Record<string, string[]>; authorTruthHidden: boolean }): { hypotheses: string[]; truthRevealed: false; supports: Record<string, string[]>; excludes: Record<string, string[]> } {
  return { hypotheses: [...new Set(input.hypotheses)], truthRevealed: false, supports: input.clueSupports, excludes: input.clueExcludes };
}

export function classifyClueDirection(input: { clue: string; supports: readonly string[]; excludes: readonly string[]; affectsAction: boolean; motifOnly: boolean }): { status: "directional" | "motif_only"; fairnessCount: number } {
  const directional = !input.motifOnly && (input.supports.length > 0 || input.excludes.length > 0) && input.affectsAction;
  return { status: directional ? "directional" : "motif_only", fairnessCount: directional ? 1 : 0 };
}

export function clusterEvidenceSources(input: { clues: Array<{ id: string; sourceFamily: string }> }): { clusters: Record<string, string[]>; effectiveEvidenceCount: number; reliabilityRisk: boolean } {
  const clusters: Record<string, string[]> = {}; for (const clue of input.clues) clusters[clue.sourceFamily] = [...(clusters[clue.sourceFamily] || []), clue.id];
  const effectiveEvidenceCount = Object.keys(clusters).length;
  return { clusters, effectiveEvidenceCount, reliabilityRisk: input.clues.length > effectiveEvidenceCount };
}

export function evaluateFairnessBundle(input: { anchorFingerprint: string; currentFingerprint: string; obligationStatus: "payoff_candidate" | "resolved" }): { status: "current" | "stale"; obligationStatus: "payoff_candidate" | "resolved" } {
  const current = input.anchorFingerprint === input.currentFingerprint;
  return { status: current ? "current" : "stale", obligationStatus: current ? input.obligationStatus : "payoff_candidate" };
}
