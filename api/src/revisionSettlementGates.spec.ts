import { describe, expect, it } from "vitest";
import { commitPartialAdoption, createLocalRepairPlan, evaluateChapterSettlement, evaluateRegressionAdoption, rejectCandidateDerivatives } from "./revisionSettlementGates.js";
describe("revision settlement gates", () => {
  it("creates targeted repair without rewriting whole chapter", () => { expect(createLocalRepairPlan({ issues: ["voice"], protectedInvariants: ["canon", "pov"], canonFingerprint: "c", povFingerprint: "p", authorLockFingerprint: "l", evidenceTargets: ["voice-evidence"], seamRisks: ["scene-2"] })).toMatchObject({ scope: "targeted" }); });
  it("blocks score-up regression", () => { expect(evaluateRegressionAdoption({ baselineAdvantages: ["silence"], candidateAdvantages: [], regressions: ["voice", "foreshadowing"], scoreDelta: 4 }).status).toBe("blocked"); });
  it("does not partially commit failed obligation write", () => { expect(commitPartialAdoption({ baselineCurrent: true, authorization: true, obligationWriteSucceeded: false, proseWriteSucceeded: true, selectedScene: "s3", recovery: false })).toMatchObject({ status: "blocked", canonChanged: false }); });
  it("invalidates rejected derivatives", () => { expect(rejectCandidateDerivatives({ authorRejected: true, derivativePatchIds: ["recap", "index"] })).toMatchObject({ status: "invalidated", futureFactVisible: false }); });
  it("requires convergence for settled maturity", () => { expect(evaluateChapterSettlement({ contentWords: 6000, score: 90, unverifiedScenes: 1, unsettledObligations: 0, staleSummaries: 1, currentFingerprintValid: true, anchorsComplete: true, derivativesConverged: false }).maturity).toBe("author_accepted"); });
});
