export function evaluateAgencyChain(input: { knownFacts: readonly string[]; options: readonly string[]; evaluatedOptions: readonly string[]; choiceReason: string; consequence: string }): { status: "allowed" | "blocked"; repairs: string[] } {
  const missing = [input.options.length ? "" : "options", input.evaluatedOptions.length ? "" : "evaluation", input.choiceReason, input.consequence].filter((value) => !value);
  return { status: missing.length ? "blocked" : "allowed", repairs: missing.length ? ["forced_tradeoff", "misinformation", "deliberate_setup"] : [] };
}

export function evaluateVoiceDrift(input: { priorVoice: string; newVoice: string; relationshipMilestones: readonly string[]; arcEvidence: readonly string[] }): { status: "explained" | "drift"; evidence: string[] } {
  const explained = input.relationshipMilestones.length > 0 && input.arcEvidence.length > 0;
  return { status: explained ? "explained" : "drift", evidence: explained ? [...input.relationshipMilestones, ...input.arcEvidence] : [] };
}

export function evaluateDialogueAction(input: { speakerA: { goal: string; action: string }; speakerB: { goal: string; action: string }; powerShift: string; distinctStrategies: boolean }): { status: "functional" | "info_qa"; missing: string[] } {
  const missing = [input.speakerA.goal, input.speakerA.action, input.speakerB.goal, input.speakerB.action, input.powerShift, input.distinctStrategies ? "" : "distinctStrategies"].filter((value) => !value);
  return { status: missing.length ? "info_qa" : "functional", missing };
}

export function evaluatePovKnowledge(input: { povKnownFacts: readonly string[]; assertedFacts: readonly string[]; priorReaderFacts: readonly string[]; newConsequence: boolean }): { status: "clean" | "blocked"; leaks: string[]; repeated: string[]; repairs: string[] } {
  const leaks = input.assertedFacts.filter((fact) => !input.povKnownFacts.includes(fact)); const repeated = input.assertedFacts.filter((fact) => input.priorReaderFacts.includes(fact) && !input.newConsequence);
  return { status: leaks.length || repeated.length ? "blocked" : "clean", leaks, repeated, repairs: leaks.length || repeated.length ? ["合法获知", "省略", "制造新后果"] : [] };
}

export function evaluateNarrativeDistance(input: { current: "close" | "overview"; next: "close" | "overview"; trigger: string; entersOtherMind: boolean; secretNamed: boolean }): { status: "allowed" | "blocked"; reason?: string } {
  if (input.entersOtherMind || input.secretNamed) return { status: "blocked", reason: "UNMARKED_POV_DISTANCE_BREACH" };
  if (input.current !== input.next && !input.trigger.trim()) return { status: "blocked", reason: "DISTANCE_CHANGE_UNMARKED" };
  return { status: "allowed" };
}

export function evaluateEmotionalAftermath(input: { trigger: string; externalManifestation: string; interpretation: string; choice: string; aftermath: string }): { status: "complete" | "summary_only"; missing: string[] } {
  const missing = [input.trigger, input.externalManifestation, input.interpretation, input.choice, input.aftermath].filter((value) => !value.trim());
  return { status: missing.length ? "summary_only" : "complete", missing };
}
