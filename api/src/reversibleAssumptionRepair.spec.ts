import { describe, expect, it } from "vitest";
import { applyScopedAssumptionRepair } from "./reversibleAssumptionRepair.js";

describe("reversible assumption repair", () => {
  it("applies a low-impact default without blocking and scopes later correction", () => {
    const applied = applyScopedAssumptionRepair({ assumptionId: "a-1", defaultValue: "黑发", affectedAssetIds: ["scene-2", "scene-5"] });
    expect(applied).toMatchObject({ status: "applied", changedAssetIds: ["scene-2", "scene-5"], canonRewriteRequired: false });
    const repaired = applyScopedAssumptionRepair({ assumptionId: "a-1", defaultValue: "黑发", affectedAssetIds: ["scene-2", "scene-5"], authorOverride: { value: "银发", affectedAssetIds: ["scene-5", "chapter-3"] } });
    expect(repaired).toMatchObject({ status: "revoked", changedAssetIds: ["scene-5"] });
  });
  it("rejects an unscoped assumption", () => {
    expect(() => applyScopedAssumptionRepair({ assumptionId: "a-2", defaultValue: "默认", affectedAssetIds: [] })).toThrow("REVERSIBLE_ASSUMPTION_FIELDS_REQUIRED");
  });
});
