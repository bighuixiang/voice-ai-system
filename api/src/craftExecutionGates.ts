export function evaluateSettingActionability(input: { expositionUnits: number; currentActionInteractions: number; neededNow: number; delayed: number; environmentPressure: number; misjudgmentCost: number }): { status: "actionable" | "infodump"; keepNow: number; defer: number; actionSignals: string[] } {
  const actionable = input.currentActionInteractions > 0 && input.expositionUnits <= input.neededNow;
  return { status: actionable ? "actionable" : "infodump", keepNow: Math.min(input.expositionUnits, input.neededNow), defer: Math.max(0, input.expositionUnits - input.neededNow), actionSignals: [input.environmentPressure > 0 ? "environment_pressure" : "", input.misjudgmentCost > 0 ? "misjudgment_cost" : ""].filter(Boolean) };
}

export function evaluateCognitiveBudget(input: { newInfoUnits: number; similarNames: number; newRules: number; clues: number; capacity: number }): { status: "within" | "overloaded"; risk: number; options: string[] } {
  const risk = input.newInfoUnits + input.similarNames + input.newRules + input.clues;
  return { status: risk <= input.capacity ? "within" : "overloaded", risk, options: risk > input.capacity ? ["merge_names", "defer_rules", "bind_to_conflict"] : [] };
}

export function detectRhythmMonotony(input: { sentenceLengths: readonly number[]; repeatedEndings: number; actionReactionJudgmentCost: boolean }): { status: "varied" | "monotone"; repairs: string[] } {
  const same = input.sentenceLengths.length > 2 && new Set(input.sentenceLengths).size === 1;
  return same || input.repeatedEndings >= 3 ? { status: "monotone", repairs: ["vary_sentence_length", "vary_paragraph_endings", "restore_action_reaction_judgment_cost"] } : { status: "varied", repairs: [] };
}

export function validateSegmentSeam(input: { priorInjuries: readonly string[]; priorItems: readonly string[]; nextActions: readonly string[]; nextItemsUsed: readonly string[] }): { status: "consistent" | "contradiction"; contradictions: string[]; rewriteScope: "minimal-connection" | "none" } {
  const contradictions = [...input.priorInjuries.filter((injury) => injury.includes("broken") && input.nextActions.some((action) => action.includes("run"))), ...input.priorItems.filter((item) => !input.nextItemsUsed.includes(item) && input.nextItemsUsed.length > 0)];
  return { status: contradictions.length ? "contradiction" : "consistent", contradictions, rewriteScope: contradictions.length ? "minimal-connection" : "none" };
}

export function recoverLongChapter(input: { frozenManifest: boolean; verifiedSegments: number; unfinishedBeats: number; baselineTail: boolean; workerCrashed: boolean }): { status: "resumed" | "blocked"; resumeFrom: string; duplicateCalls: false } {
  const ready = input.frozenManifest && input.verifiedSegments > 0 && input.baselineTail && input.workerCrashed;
  return { status: ready ? "resumed" : "blocked", resumeFrom: ready ? `segment-${input.verifiedSegments}` : "", duplicateCalls: false };
}

export function detectStagnation(input: { coreProblemUnchanged: boolean; versions: number; maxSimilarVersions: number }): { status: "continue" | "paused"; reason?: string; nextQuestion?: string } {
  if (input.coreProblemUnchanged && input.versions >= input.maxSimilarVersions) return { status: "paused", reason: "GOAL_NOT_CONVERGING", nextQuestion: "Which structural choice changes the character's available action?" };
  return { status: "continue" };
}

export function synthesizeRedBlue(input: { blueValidOpening: boolean; redEvidence: readonly string[]; selfScore: number; failures: readonly string[] }): { status: "adoptable" | "blocked"; retained: string[]; repairOnly: string[] } {
  return input.redEvidence.length && input.failures.length ? { status: "blocked", retained: input.blueValidOpening ? ["opening"] : [], repairOnly: input.failures.slice(0, 2) } : { status: "adoptable", retained: input.blueValidOpening ? ["opening"] : [], repairOnly: [] };
}

export function evaluateMultiDomainValidation(input: { score: number; hardFailures: readonly string[]; missedObligations: readonly string[]; evaluatedDomains: readonly string[] }): { status: "adoptable" | "blocked"; score: number; blockers: string[]; unevaluated: string[] } {
  const unevaluated = ["pov", "voice", "obligations"].filter((domain) => !input.evaluatedDomains.includes(domain)); const blockers = [...input.hardFailures, ...input.missedObligations];
  return { status: blockers.length ? "blocked" : "adoptable", score: input.score, blockers, unevaluated };
}
