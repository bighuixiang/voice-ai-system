export function createLocalRepairPlan(input: { issues: readonly string[]; protectedInvariants: readonly string[]; canonFingerprint: string; povFingerprint: string; authorLockFingerprint: string; evidenceTargets: readonly string[]; seamRisks: readonly string[] }): { status: "local"; scope: "targeted"; protectedInvariants: string[]; evidenceTargets: string[]; seamRisks: string[] } {
  return { status: "local", scope: "targeted", protectedInvariants: [...input.protectedInvariants], evidenceTargets: [...input.evidenceTargets], seamRisks: [...input.seamRisks] };
}

export function evaluateRegressionAdoption(input: { baselineAdvantages: readonly string[]; candidateAdvantages: readonly string[]; regressions: readonly string[]; scoreDelta: number }): { status: "adoptable" | "blocked"; narrowerRepair: boolean; preserveBaseline: boolean } {
  return input.regressions.length ? { status: "blocked", narrowerRepair: true, preserveBaseline: true } : { status: "adoptable", narrowerRepair: false, preserveBaseline: false };
}

export function commitPartialAdoption(input: { baselineCurrent: boolean; authorization: boolean; obligationWriteSucceeded: boolean; proseWriteSucceeded: boolean; selectedScene: string; recovery: boolean }): { status: "committed" | "blocked" | "replayed"; canonChanged: boolean; oldVersionRetained: true; rollbackAvailable: true } {
  if (input.recovery && input.baselineCurrent && input.authorization && input.obligationWriteSucceeded && input.proseWriteSucceeded) return { status: "replayed", canonChanged: true, oldVersionRetained: true, rollbackAvailable: true };
  if (!input.baselineCurrent || !input.authorization || !input.obligationWriteSucceeded || !input.proseWriteSucceeded) return { status: "blocked", canonChanged: false, oldVersionRetained: true, rollbackAvailable: true };
  return { status: "committed", canonChanged: true, oldVersionRetained: true, rollbackAvailable: true };
}

export function rejectCandidateDerivatives(input: { authorRejected: boolean; derivativePatchIds: readonly string[] }): { status: "invalidated" | "active"; futureFactVisible: false; invalidatedPatchIds: string[] } {
  return input.authorRejected ? { status: "invalidated", futureFactVisible: false, invalidatedPatchIds: [...input.derivativePatchIds] } : { status: "active", futureFactVisible: false, invalidatedPatchIds: [] };
}

export function evaluateChapterSettlement(input: { contentWords: number; score: number; unverifiedScenes: number; unsettledObligations: number; staleSummaries: number; currentFingerprintValid: boolean; anchorsComplete: boolean; derivativesConverged: boolean }): { maturity: "author_accepted" | "settled"; staleOnlyDependencies: boolean } {
  const settled = input.contentWords > 0 && input.score >= 0 && input.unverifiedScenes === 0 && input.unsettledObligations === 0 && input.staleSummaries === 0 && input.currentFingerprintValid && input.anchorsComplete && input.derivativesConverged;
  return { maturity: settled ? "settled" : "author_accepted", staleOnlyDependencies: true };
}
