import { describe, expect, it } from "vitest";
import { projectWorldState } from "./worldStateProjection.js";
import type { WorldStateSnapshot } from "./worldState.js";

const snapshot = (region: string, asOf: string, publicationVersion = "canon-1"): WorldStateSnapshot => ({ schemaVersion: "world-state-snapshot.v1", snapshotId: `${region}-${asOf}`, projectSlug: "demo", asOf, region, publicationVersion, politicalControl: [region], activeConflicts: [], institutions: [], infrastructure: [], markets: [], environment: [], resources: [], effectiveRuleIds: [], unknowns: [], sourceRefs: [`chapter://${asOf}`], createdAt: "2026-01-01T00:00:00Z", fingerprint: `${region}-${asOf}` });
describe("world state projection", () => {
  it("selects the latest exact regional snapshot at or before story time", () => {
    const result = projectWorldState([snapshot("north", "chapter-001"), snapshot("north", "chapter-003"), snapshot("south", "chapter-003")], { region: "north", asOf: "chapter-004", publicationVersion: "canon-1" });
    expect(result.status).toBe("resolved");
    expect(result.snapshotId).toBe("north-chapter-003");
  });

  it("does not fill an unknown region from another region's state", () => {
    const result = projectWorldState([snapshot("north", "chapter-001")], { region: "south", asOf: "chapter-002", publicationVersion: "canon-1" });
    expect(result.status).toBe("unknown");
    expect(result.snapshotId).toBeUndefined();
  });

  it("keeps publication versions isolated", () => {
    const result = projectWorldState([snapshot("north", "chapter-001", "canon-1"), snapshot("north", "chapter-002", "canon-2")], { region: "north", asOf: "chapter-003", publicationVersion: "canon-1" });
    expect(result.snapshotId).toBe("north-chapter-001");
  });
});
