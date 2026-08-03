import { describe, expect, it } from "vitest";
import { buildResumeBrief, buildReviewFirstScreen, evaluateClickValue, evaluateCollaborationPreference, evaluateKernelValue, presentUserLanguage, throttleTaskNotifications } from "./collaborationUxGates.js";
describe("collaboration UX gates", () => {
  it("keeps blockers visible while folding passed checks", () => { expect(buildReviewFirstScreen({ goal: "repair voice", retained: ["silence"], blockers: ["motivation"], changes: ["scene-2"], recommendation: "local repair", passedChecks: 37 })).toMatchObject({ collapsedPassedChecks: 37, criticalVisible: true }); });
  it("coalesces stage updates and notifies candidate once", () => { expect(throttleTaskNotifications({ stageUpdates: 10, retries: 2, candidateReady: true, hardStop: false, l2Block: false })).toMatchObject({ cardUpdates: 1, notifications: 1 }); });
  it("builds cross-day brief without history scroll", () => { expect(buildResumeBrief({ direction: "voice", adoptedChapters: ["ch1"], lowRiskDecisions: ["place"], rollbackItem: "r1", candidate: "c1", question: "q1" }).historyRequired).toBe(false); });
  it("does not infer permanent preference from absence", () => { expect(evaluateCollaborationPreference({ skippedEvidenceCount: 0, explicitConciseRequest: false, daysOffline: 2, majorGate: true })).toMatchObject({ mode: "default", inferredPermanent: false, majorGatePreserved: true }); });
  it("hides internal terms by default", () => { expect(presentUserLanguage({ userText: "检查已确认伏笔", internalDetails: ["ContextManifest"], advancedOpen: false }).internalVisible).toBe(false); });
  it("rejects click reduction when rework rises", () => { expect(evaluateClickValue({ confirmationReduction: 0.4, reworkIncrease: 2, revocationsIncrease: 1, authorWritingTimeIncrease: 0, qualityRegression: false }).status).toBe("not_improved"); });
  it("does not claim product delivery from kernel completion", () => { expect(evaluateKernelValue({ kernelVerified: true, oneSentenceJourneyWorking: false, recoveryWorking: false })).toMatchObject({ internalStatus: "verified", productStatus: "incomplete" }); });
});
