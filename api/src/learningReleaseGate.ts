export function evaluateLearningRelease(input: { shadowAcceptanceDelta: number; hardVoiceFailuresDelta: number; reworkDelta: number; canaryActive: boolean; previousStableVersion: string }): { status: "approved" | "rejected" | "rolled_back"; effectiveVersion: string | null; reasons: string[] } {
  const reasons = [...(input.hardVoiceFailuresDelta > 0 ? ["HARD_VOICE_FAILURE_REGRESSION"] : []), ...(input.reworkDelta > 0 ? ["REWORK_REGRESSION"] : [])];
  if (reasons.length && input.canaryActive) return { status: "rolled_back", effectiveVersion: input.previousStableVersion, reasons };
  if (reasons.length) return { status: "rejected", effectiveVersion: null, reasons };
  return { status: "approved", effectiveVersion: "candidate", reasons: [] };
}
