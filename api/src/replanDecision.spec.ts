import { describe, expect, it } from "vitest";
import { createReplanDecision } from "./replanDecision.js";

describe("evidence-based replanning", () => {
  const base = { runId: "run-1", triggerEvidence: ["stagnation:1", "author-direction:2"], affectedWorkItemIds: ["w-2", "w-3"], affectedNodeIds: ["chapter-affected"], currentGraphVersion: 4, redArgument: "preserve settled canon", blueArgument: "change future window", authorChoice: "partial-future" as const, authorizationGranted: false, impact: { status: "ready" as const, affectedNodeIds: ["chapter-affected"], unknownNodeIds: [], protectedAffectedNodeIds: [], unaffectedNodeIds: ["chapter-stable"] } };

  it("creates a scoped successor graph and preserves settled assets", () => {
    const decision = createReplanDecision(base);
    expect(decision).toMatchObject({ status: "accepted", alternativeGraphVersion: 5, authorChoice: "partial-future" });
    expect(decision.affectedWorkItemIds).toEqual(["w-2", "w-3"]);
    expect(decision.invalidatedAssetIds).toEqual([]);
    expect(decision.preservedNodeIds).toEqual(["chapter-stable"]);
  });

  it("blocks retroactive canon changes without explicit authorization", () => {
    expect(() => createReplanDecision({ ...base, authorChoice: "retroactive-canon", authorizationGranted: false })).toThrow("RETROACTIVE_REPLAN_AUTHORIZATION_REQUIRED");
  });

  it("blocks any replan when the impact closure is unknown or protected", () => {
    expect(() => createReplanDecision({ ...base, impact: { ...base.impact, status: "blocked" } })).toThrow("REPLAN_IMPACT_BLOCKED");
    expect(() => createReplanDecision({ ...base, impact: { ...base.impact, unknownNodeIds: ["missing"] } })).toThrow("REPLAN_IMPACT_BLOCKED");
    expect(() => createReplanDecision({ ...base, impact: { ...base.impact, protectedAffectedNodeIds: ["canon-1"] } })).toThrow("REPLAN_IMPACT_BLOCKED");
  });

  it("records invalidated assets only for an authorized retroactive choice", () => {
    const decision = createReplanDecision({ ...base, authorChoice: "retroactive-canon", authorizationGranted: true, affectedAssetIds: ["chapter-1"] });
    expect(decision).toMatchObject({ status: "accepted", invalidatedAssetIds: ["chapter-1"] });
  });

  it("rejects a replan whose declared scope omits an impacted node", () => {
    expect(() => createReplanDecision({ ...base, affectedNodeIds: [], impact: { ...base.impact, affectedNodeIds: ["chapter-affected", "chapter-downstream"] } })).toThrow("REPLAN_SCOPE_INCOMPLETE");
  });
});
