import { IntentCorrection, IntentCorrectionPropagation, IntentCorrectionPropagationInput, propagateIntentCorrection } from "./intentCorrection.js";

export interface CorrectionBeforeContinue extends IntentCorrectionPropagation {
  supersedes: { priorInterpretation: string; correctedInterpretation: string };
  recomputedConstraintAssets: string[];
  continueAuthorized: boolean;
  contextInterpretation: string;
}

export function applyCorrectionBeforeContinue(correction: IntentCorrection, input: IntentCorrectionPropagationInput & { recomputedConstraintAssets?: readonly string[] }): CorrectionBeforeContinue {
  if (correction.status !== "accepted") throw new Error("CORRECTION_MUST_BE_ACCEPTED_BEFORE_CONTINUE");
  const { recomputedConstraintAssets, ...artifacts } = input;
  const propagation = propagateIntentCorrection(correction, artifacts);
  const recomputed = [...new Set((recomputedConstraintAssets ?? correction.affectedAssets).filter((asset) => correction.affectedAssets.includes(asset)))];
  if (!recomputed.length) throw new Error("CORRECTION_CONSTRAINTS_NOT_RECOMPUTED");
  return {
    ...propagation,
    supersedes: { priorInterpretation: correction.priorInterpretation, correctedInterpretation: correction.correctedInterpretation },
    recomputedConstraintAssets: recomputed,
    continueAuthorized: true,
    contextInterpretation: correction.correctedInterpretation,
  };
}
