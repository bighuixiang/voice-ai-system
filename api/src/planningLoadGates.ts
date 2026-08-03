export function evaluatePlannedObligations(input: { plannedSeeds: number; factLedgerEntries: number; reveals: number; relationshipReversals: number; cognitiveCapacity: number }): { status: "planned" | "overloaded"; seededFacts: number; spreadAcrossChapters: boolean } {
  const load = input.reveals + input.relationshipReversals + input.plannedSeeds;
  return { status: load > input.cognitiveCapacity ? "overloaded" : "planned", seededFacts: input.factLedgerEntries, spreadAcrossChapters: load > input.cognitiveCapacity };
}

export function detectPacingFatigue(input: { chapters: Array<{ pressure: number; information: number; hook: number; relationship: number; emotion: number }> }): { status: "fatigue" | "balanced"; reasons: string[]; suggestedAdjustment?: string } {
  const high = input.chapters.filter((chapter) => chapter.pressure >= 0.8 && chapter.information >= 0.8 && chapter.hook >= 0.8).length;
  const lowAfterglow = input.chapters.every((chapter) => chapter.relationship < 0.4 && chapter.emotion < 0.4);
  if (high >= 4 && lowAfterglow) return { status: "fatigue", reasons: ["HIGH_PRESSURE_RUN", "NO_RELATIONAL_AFTERGLOW", "REPEATED_RETURN_SHAPE"], suggestedAdjustment: "lower_external_pressure_in_one_chapter_and_raise_relationship_change" };
  return { status: "balanced", reasons: [] };
}

export function evaluateChapterCapacity(input: { currentUnits: number; requestedUnits: number; capacity: number; acceptedRisk: boolean }): { status: "fits" | "overloaded"; currentUnits: number; projectedUnits: number; options: Array<"split" | "defer" | "replace"> } {
  const projectedUnits = input.currentUnits + input.requestedUnits;
  if (projectedUnits <= input.capacity || input.acceptedRisk) return { status: "fits", currentUnits: input.currentUnits, projectedUnits, options: [] };
  return { status: "overloaded", currentUnits: input.currentUnits, projectedUnits, options: ["split", "defer", "replace"] };
}

export function classifyPlanHorizon(input: { endingCommitted: boolean; nearRolling: boolean; farTentative: boolean; allyExploratory: boolean }): { horizon: Array<{ kind: string; confidence: string }>; remoteDetailsConfirmed: false } {
  return { horizon: [{ kind: "ending", confidence: input.endingCommitted ? "committed" : "tentative" }, { kind: "near", confidence: input.nearRolling ? "rolling" : "tentative" }, { kind: "far", confidence: input.farTentative ? "tentative" : "exploratory" }, { kind: "new_ally", confidence: input.allyExploratory ? "exploratory" : "tentative" }], remoteDetailsConfirmed: false };
}
