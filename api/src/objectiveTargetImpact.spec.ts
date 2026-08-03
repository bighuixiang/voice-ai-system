import { describe, expect, it } from "vitest";
import { classifyObjectiveTargetImpact } from "./objectiveTargetImpact.js";

describe("objective target impact", () => {
  it("stales only causal future assets and preserves published and unrelated assets", () => {
    expect(classifyObjectiveTargetImpact({ changedObjectiveId: "audience", affectedAssets: [{ id: "future-candidate", dependsOnObjectiveIds: ["audience"], published: false }, { id: "published-ch1", dependsOnObjectiveIds: ["audience"], published: true }, { id: "foreshadowing-1", dependsOnObjectiveIds: ["tone"], published: false }] })).toEqual({ staleAssetIds: ["future-candidate"], preservedPublishedAssetIds: ["published-ch1"], unrelatedAssetIds: ["foreshadowing-1"] });
  });
});
