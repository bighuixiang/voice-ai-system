import { describe, expect, it } from "vitest";
import { assessCounterfactualScene, assessLongitudinalExperience, boundExperienceDossier, classifySurprise, gateReviewerCalibration, invalidateAfterRevision, preserveReaderDivergence, preserveRepairAdvantages, revokeReaderFeedback } from "./experienceReviewGates.js";
describe("experience review gates", () => {
  it("keeps a quiet scene when removal loses relationship function", () => { expect(assessCounterfactualScene({ removedFunctions: ["avoidance-pattern"], uniqueTexture: true, repeatedInformation: false }).status).toBe("necessary"); });
  it("classifies fair surprise only with evidence and alternatives", () => { expect(classifySurprise({ priorEvidence: 2, competingHypotheses: 2, introducesNewRule: false })).toBe("fair"); });
  it("does not let one strong chapter erase longitudinal debt", () => { expect(assessLongitudinalExperience({ chapterScore: .95, resetGoals: 2, unansweredCoreQuestions: 3, locationConfusion: true }).pass).toBe(false); });
  it("preserves reader disagreement instead of averaging it away", () => { expect(preserveReaderDivergence({ samples: [{ audience: "new", result: "overloaded", evidence: ["r1"] }, { audience: "genre", result: "clear", evidence: ["r2"] }] }).average).toBeNull(); });
  it("keeps uncalibrated reviewer experimental", () => { expect(gateReviewerCalibration({ humanSamples: 1, blind: true, agreementRate: .9 }).hardGateEligible).toBe(false); });
  it("invalidates linked reader state after deleted evidence", () => { expect(invalidateAfterRevision({ deletedEvidence: true, linkedItems: ["question", "payoff"] }).rerunColdRead).toBe(true); });
  it("accepts targeted repair that preserves strengths", () => { expect(preserveRepairAdvantages({ targetedFix: true, broadExplanation: false, originalStrengths: ["voice"] }).accepted).toBe(true); });
  it("propagates withdrawn feedback beyond UI hiding", () => { expect(revokeReaderFeedback({ feedbackId: "f1", authorized: true, withdrawn: true, derived: ["aggregate", "candidate"] }).status).toBe("deleted"); });
  it("bounds dossier claims to reviewed evidence", () => { expect(boundExperienceDossier({ reviewedRange: "ch1-10", coldReadFailures: 2, disagreements: 1, unknowns: 1 }).fullBookHealthy).toBe(false); });
});
