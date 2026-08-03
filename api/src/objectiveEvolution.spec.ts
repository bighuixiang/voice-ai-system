import { describe, expect, it } from "vitest";
import { analyzeObjectiveChange, monitorObjectiveDrift } from "./objectiveEvolution.js";

const item = { objectiveId: "voice", kind: "preference" as const, text: "restrained", scope: "work" as const, sourceRefs: ["s1"], verification: "review" };

describe("objective evolution", () => {
  it("keeps historical versions and blocks unauthorized retroactive rewrites", () => {
    const result = analyzeObjectiveChange({ oldVersion: 1, newVersion: 2, oldItems: [item], newItems: [{ ...item, text: "lyrical" }], affectedAssets: ["chapter-2", "candidate-3"], retroactiveRequested: true, authorizationGranted: false });
    expect(result).toMatchObject({ preservedHistoricalVersion: 1, changedObjectiveIds: ["voice"], retroactiveAuthorizationRequired: true, reasons: ["RETROACTIVE_OBJECTIVE_AUTHORIZATION_REQUIRED"] });
  });
  it("locates drift and distinguishes oscillation from a single deviation", () => {
    expect(monitorObjectiveDrift({ targetVersion: 2, observations: [{ assetId: "ch-1", targetVersion: 1, deviation: ["voice"], sourceLayer: "generation" }] }).status).toBe("drifting");
    expect(monitorObjectiveDrift({ targetVersion: 2, observations: [{ assetId: "ch-1", targetVersion: 2, deviation: [], sourceLayer: "generation" }, { assetId: "ch-2", targetVersion: 1, deviation: ["voice"], sourceLayer: "review" }, { assetId: "ch-3", targetVersion: 2, deviation: ["voice"], sourceLayer: "author-feedback" }] }).status).toBe("oscillating");
  });
});
