import { describe, expect, it } from "vitest";
import { adoptSeedFields, recompileSeedIncrementally } from "./seedAdoption.js";

describe("seed adoption and incremental recompilation", () => {
  it("adopts only selected fields and keeps stable semantic ids for accepted fields", () => {
    const result = adoptSeedFields({ existing: [{ field: "protagonist", value: "courier", status: "adopted" }, { field: "ending", value: "unknown", status: "unknown" }], decisions: [{ field: "ending", value: "door remains open", decision: "accept" }, { field: "protagonist", value: "pilot", decision: "reject" }] });
    expect(result.fields.find((field) => field.field === "protagonist")?.value).toBe("courier");
    expect(result.fields.find((field) => field.field === "ending")?.status).toBe("adopted");
    expect(result.fields.find((field) => field.field === "ending")?.semanticId).toBeTruthy();
  });

  it("recompiles only affected fields and preserves unrelated adopted meanings", () => {
    const result = recompileSeedIncrementally({ fields: [{ field: "desire", value: "open door", version: 1 }, { field: "protagonist", value: "courier", version: 1 }], changedFields: ["desire"], dependencyMap: { desire: ["recent-conflict"], protagonist: [] } });
    expect(result.recompiled).toEqual(["desire"]);
    expect(result.preserved).toEqual(["protagonist"]);
  });
});
