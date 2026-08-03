import { describe, expect, it } from "vitest";
import { classifyNormativeStrength, gateConvergenceExpansion, preserveSemanticLint, requireDeferDecision, separateReleaseVision, validateFirstSlice } from "./requirementGovernanceGates.js";
describe("requirement governance gates", () => {
  it("does not infer MUST from wording", () => { expect(classifyNormativeStrength({ parsedMUST: true }).strength).toBe("unclassified"); });
  it("blocks orphan MUST without user journey first slice", () => { expect(validateFirstSlice({ requirementId: "R", firstSlice: "K5", userJourney: false, kernelOnly: true }).blocker).toBe(true); });
  it("separates current release from future vision", () => { expect(separateReleaseVision({ releaseVerified: true, futureSpecified: 7, futurePlanned: 2 })).toMatchObject({ release: "publishable" }); });
  it("requires defer decision when profile budget is full", () => { expect(requireDeferDecision({ profile: "V2", budgetReached: true, newMust: true }).approved).toBe(false); });
  it("keeps semantic lint advisory", () => { expect(preserveSemanticLint({ similar: true, boundaries: ["scope"] }).deletable).toBe(false); });
  it("requires gap evidence before convergence expansion", () => { expect(gateConvergenceExpansion({ expressive: true, journeyGap: false, modelGap: false, firstSlice: false, budgetReplacement: false }).backlogCandidate).toBe(true); });
});
