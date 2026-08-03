import { describe, expect, it } from "vitest";
import { classifyCharacterSource, detectAgencyBreak, evaluateCharacterArc, ignoreCoPresenceWithoutChange, modelBeliefPhases, preserveAsymmetricRelation, preserveCharacterUnknowns, preserveSourceConflict } from "./characterCausalityGates.js";
describe("character causality gates", () => {
  it("keeps non-character documents out of character authority", () => { expect(classifyCharacterSource({ stableIdentity: false, sourceProven: true, documentType: true }).kind).toBe("source-document"); });
  it("preserves unknown character contract fields", () => { expect(preserveCharacterUnknowns({ desire: "return", avoidance: "home", source: "user" }).unknown).toContain("coreMisbelief"); });
  it("keeps conflicting sources pending", () => { expect(preserveSourceConflict({ sources: [{ source: "bible", claim: "30" }, { source: "text", claim: "35" }], resolved: false }).status).toBe("pending"); });
  it("requires choice, cost and state change for arc progress", () => { expect(evaluateCharacterArc({ milestonePlanned: true, choice: false, cost: true, stateChanged: true }).progressed).toBe(false); });
  it("blocks unmotivated agency break", () => { expect(detectAgencyBreak({ knowsEscape: true, hasTime: true, alternativeCount: 2, authorException: false }).blocked).toBe(true); });
  it("keeps belief phases including relapse", () => { expect(modelBeliefPhases({ established: true, shaken: true, relapsed: true, transformed: false })).toEqual(["established", "shaken", "relapsed"]); });
  it("preserves directional relationship state", () => { expect(preserveAsymmetricRelation({ aToB: { trust: 80 }, bToA: { trust: 20 } }).symmetric).toBe(false); });
  it("does not infer relationship change from co-presence alone", () => { expect(ignoreCoPresenceWithoutChange({ coPresenceCount: 3, directedActions: 0, stateChanges: 0 }).relationshipProgress).toBe(false); });
});
