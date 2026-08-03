import { describe, expect, it } from "vitest";
import { createDecisionBundle, handleOffline, presentChoice, propagateCorrection, resolveContinue, reuseConfirmedFact, scopeDelegation, settleDerivedAnswer, summarizeStoryCost } from "./authorInteractionGates.js";
describe("author interaction gates", () => {
  it("settles derived questions together", () => { expect(settleDerivedAnswer({ answered: ["motive", "knowledge", "pressure"], unresolved: ["child-identity"] }).remaining).toEqual(["child-identity"]); });
  it("atomically revokes only low-risk bundle", () => { expect(createDecisionBundle({ decisions: [{ id: "place-1", risk: "low", rollback: true }], revokeRequested: true })).toMatchObject({ status: "revoked", atomic: true }); });
  it("presents recommendation and red risk", () => { expect(presentChoice({ recommendation: "leak", recommendationFit: "arc-fit", redRisk: "trust-loss", options: ["leak", "hide"], freeAnswer: true }).status).toBe("presented"); });
  it("shows story cost without technical details", () => { expect(summarizeStoryCost({ arcs: ["arc"], foreshadowing: ["fs"], chapters: ["ch4"], reworkUnits: 3, reversible: true }).technicalDetailsHidden).toBe(true); });
  it("scopes delegation to one issue", () => { expect(scopeDelegation({ issueId: "job", delegated: true })).toEqual({ delegatedIssue: "job", permanent: false }); });
  it("continues through safe contract result", () => { expect(resolveContinue({ answered: true, contractCandidateAvailable: true, sameStateReplay: false }).action).toBe("settle-and-contract"); });
  it("does not adopt during offline period", () => { expect(handleOffline({ authorOffline: true, highImpactPending: true, candidateCreated: true, authorReturned: false })).toEqual({ status: "waiting", autoAdopted: false }); });
  it("reuses confirmed POV until conflict", () => { expect(reuseConfirmedFact({ confirmed: true, newConflict: false, newEvidence: [] }).status).toBe("reuse"); });
  it("stops old understanding after correction", () => { expect(propagateCorrection({ oldUnderstanding: "A", corrected: "B", downstreamIds: ["outline", "candidate"] })).toMatchObject({ status: "stopped", staleIds: ["outline", "candidate"], current: "B" }); });
});
