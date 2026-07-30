import { describe, expect, it } from "vitest";
import { settleDerivedChanges } from "./derivedSettlement.js";

const valid = { adoptionStatus: "committed" as const, anchorRebuildStatus: "passed" as const, evidenceStatus: "valid" as const, derivedChanges: [{ kind: "fact" as const, id: "fact-1" }, { kind: "character-state" as const, id: "state-1" }], sourceRefs: ["prose://segment-1"] };
describe("derived settlement after prose adoption", () => {
  it("settles derived changes only after adoption and anchor rebuild", () => { const result = settleDerivedChanges(valid); expect(result.status).toBe("settled"); expect(result.appliedChanges).toHaveLength(2); });
  it("cancels all derived patches on rejection, conflict, rollback or stale evidence", () => { for (const adoptionStatus of ["rejected", "conflict", "rolled_back"] as const) { const result = settleDerivedChanges({ ...valid, adoptionStatus }); expect(result.status).toBe("cancelled"); expect(result.appliedChanges).toEqual([]); } const stale = settleDerivedChanges({ ...valid, evidenceStatus: "stale" }); expect(stale.status).toBe("cancelled"); });
  it("requires evidence and refuses partial settlement", () => { expect(settleDerivedChanges({ ...valid, anchorRebuildStatus: "failed" }).reason).toBe("ANCHOR_REBUILD_REQUIRED"); expect(settleDerivedChanges({ ...valid, derivedChanges: [] }).reason).toBe("DERIVED_CHANGES_REQUIRED"); });
});
