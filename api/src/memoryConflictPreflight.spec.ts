import { describe, expect, it } from "vitest";
import { createMemoryClaim, createMemoryClaimRelation } from "./memoryClaim.js";
import { buildMemoryConflictPreflight } from "./memoryConflictPreflight.js";

const claim = (claimId: string, proposition: string) => createMemoryClaim({ claimId, proposition, epistemicType: "canon_fact", sourceRefs: [`chapter://${claimId}`], evidenceAnchors: [`${claimId}#1`], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 });

describe("memory conflict preflight", () => {
  it("blocks on persisted contradiction sets even when caller risk flags are absent", () => {
    const left = claim("left", "gate open");
    const right = claim("right", "gate sealed");
    const relation = createMemoryClaimRelation({ fromClaimId: left.claimId, toClaimId: right.claimId, relation: "contradicts", sourceRefs: ["chapter://conflict"], validFromVersion: "v1" });
    const gate = buildMemoryConflictPreflight({ claims: [left, right], relations: [relation], freshness: { status: "current", blockingReasons: [], affectedClaimIds: [] } });
    expect(gate).toMatchObject({ status: "blocked", blockers: ["MEMORY_CONTRADICTION_UNRESOLVED"], authority: "persisted-memory-claims-and-relations" });
  });

  it("blocks stale projections without requiring a contradiction", () => {
    const gate = buildMemoryConflictPreflight({ claims: [], relations: [], freshness: { status: "stale", blockingReasons: ["MEMORY_PROJECTION_STALE"], affectedClaimIds: ["claim-1"] } });
    expect(gate).toMatchObject({ status: "blocked", blockers: ["MEMORY_PROJECTION_STALE"] });
  });
});
