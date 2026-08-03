import { describe, expect, it } from "vitest";
import { assessCharacterFunction, assessEnsembleAttention, assessIndependentOpponent, assessMisunderstandingRepair, buildIdentityBreakImpact, issueArcCertificate, preserveRelapseProgress, scopeCharacterChange, validateOffscreenAction, validateRelationalVoice } from "./relationshipCausalityGates.js";
describe("relationship causality gates", () => {
  it("does not equate corrected fact with repaired trust", () => { expect(assessMisunderstandingRepair({ factCorrected: true, harmAcknowledged: false, restitution: false, newChoice: false }).relationshipRepaired).toBe(false); });
  it("requires opponent action outside protagonist presence", () => { expect(assessIndependentOpponent({ absentActions: 0, goal: true, constraints: true, changedOutcome: true }).independent).toBe(false); });
  it("requires anchors for offscreen plans", () => { expect(validateOffscreenAction({ goal: "witness", actions: ["call"], costs: ["risk"], anchors: [] }).valid).toBe(false); });
  it("judges secondary characters by function not appearance count", () => { expect(assessCharacterFunction({ appearances: 10, independentChoices: 0, consequences: 0, repeatedInformation: 10 }).healthy).toBe(false); });
  it("requires choice and consequence share in ensemble", () => { expect(assessEnsembleAttention({ members: [{ goal: true, choice: true, consequence: true }, { goal: true, choice: false, consequence: false }] }).sufficient).toBe(false); });
  it("requires milestone evidence for relational voice changes", () => { expect(validateRelationalVoice({ relationStage: "reconciled", changedMarkers: ["address"], milestoneEvidence: [], personalityFlip: false }).valid).toBe(false); });
  it("preserves learned capacity through relapse", () => { expect(preserveRelapseProgress({ relapse: true, residualSkill: true, newCost: true }).reset).toBe(false); });
  it("preserves old costs and other knowledge through identity break", () => { expect(buildIdentityBreakImpact({ domains: ["knowledge", "duties"], oldCosts: ["trust-loss"], amnesia: true }).retroactiveKnowledgeDeletion).toBe(false); });
  it("recomputes only affected character subgraph", () => { expect(scopeCharacterChange({ changedNodes: ["c1"], affectedNodes: ["scene1"], protectedNodes: ["scene9"] }).recompute).toEqual(["c1", "scene1"]); });
  it("blocks incomplete arc certificate", () => { expect(issueArcCertificate({ milestones: [{ id: "m1", evidence: [], openAuthorized: false }], complete: true }).status).toBe("blocked"); });
});
