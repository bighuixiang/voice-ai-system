export function evaluateExecutionReadiness(input: { frozenChapters: number; requiredChapters: number; conflicts: number; nextContextComplete: boolean; structureVersion: string; adoptionAuthority: string; changedSinceProof: boolean }): { status: "ready" | "blocked" | "stale"; fingerprint: string; workersInvalidated: boolean } {
  if (input.changedSinceProof) return { status: "stale", fingerprint: "", workersInvalidated: true };
  const ready = input.frozenChapters >= input.requiredChapters && input.conflicts === 0 && input.nextContextComplete && !!input.structureVersion && !!input.adoptionAuthority;
  return { status: ready ? "ready" : "blocked", fingerprint: ready ? `${input.structureVersion}:${input.adoptionAuthority}:${input.frozenChapters}` : "", workersInvalidated: false };
}

export function freezeProseTaskInput(input: { storyVersion: string; outlineVersion: string; sceneVersion: string; characterVersion: string; obligationVersion: string; authorLockVersion: string; craftVersion: string; directionVersion: string; proseBaseline: string; contextVersion: string; currentPov: string; requestedPov: string }): { status: "frozen" | "stale"; candidateStatus: "ready" | "stale"; fingerprint: string } {
  const stale = input.currentPov !== input.requestedPov;
  return { status: stale ? "stale" : "frozen", candidateStatus: stale ? "stale" : "ready", fingerprint: stale ? "" : [input.storyVersion, input.outlineVersion, input.sceneVersion, input.characterVersion, input.obligationVersion, input.authorLockVersion, input.craftVersion, input.directionVersion, input.proseBaseline, input.contextVersion, input.requestedPov].join(":" ) };
}

export function evaluateAutonomousCanonWrite(input: { targetStatus: "draft" | "author_accepted" | "settled"; authorization: boolean; frozenBaseline: boolean; validationPassed: boolean }): { status: "candidate" | "revision_branch" | "blocked"; canonWrites: false; candidateSaved: boolean } {
  if (input.targetStatus === "author_accepted" || input.targetStatus === "settled") return { status: "revision_branch", canonWrites: false, candidateSaved: true };
  if (!input.authorization || !input.frozenBaseline || !input.validationPassed) return { status: "blocked", canonWrites: false, candidateSaved: true };
  return { status: "candidate", canonWrites: false, candidateSaved: true };
}

export function relocateSemanticPatch(input: { semanticId: string; textFingerprint: string; candidatePositions: number }): { status: "applied" | "blocked"; position?: number; reason?: string } {
  if (input.candidatePositions !== 1) return { status: "blocked", reason: input.candidatePositions === 0 ? "SEMANTIC_TARGET_NOT_FOUND" : "AMBIGUOUS_SEMANTIC_TARGET" };
  return { status: "applied", position: 1 };
}

export function evaluateSceneLedger(input: { requiredStrategies: readonly string[]; evidencedStrategies: readonly string[]; choices: readonly string[]; costs: readonly string[] }): { status: "complete" | "missed"; evidenced: string[]; missed: string[] } {
  const evidenced = input.requiredStrategies.filter((item) => input.evidencedStrategies.includes(item)); const missed = input.requiredStrategies.filter((item) => !evidenced.includes(item) || (item === "choice" && !input.choices.length) || (item === "cost" && !input.costs.length));
  return { status: missed.length ? "missed" : "complete", evidenced, missed };
}

export function evaluateBeatEvidence(input: { beatId: string; summaryClaims: readonly string[]; proseEvidence: readonly string[]; semanticEvidence: readonly string[] }): { status: "seeded" | "missed"; canSeed: boolean } {
  const proven = input.proseEvidence.length > 0 && input.semanticEvidence.length > 0 && input.summaryClaims.includes(input.beatId);
  return { status: proven ? "seeded" : "missed", canSeed: proven };
}
