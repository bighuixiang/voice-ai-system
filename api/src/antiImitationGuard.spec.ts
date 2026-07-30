import { describe, expect, it } from "vitest";
import { runAntiImitationGuard } from "./antiImitationGuard.js";

const valid = { authorizedSourceIds: ["source-safe"], sourceEntities: ["Old Kingdom"], distinctiveImagery: ["red moon over glass sea"], sourceRefs: ["source://safe"], beforeContext: [{ sourceId: "source-safe", text: "abstract mechanism only" }], generatedText: "A new city archive uses a different image and characters.", generatedNgrams: [], generatedSemanticNeighbors: [] };
describe("anti-imitation guard", () => {
  it("passes clean authorized abstract context and generated text", () => { const result = runAntiImitationGuard(valid); expect(result.status).toBe("passed"); expect(result.actions).toEqual([]); });
  it("blocks unauthorized source, long excerpts, entities, and distinctive combinations", () => { const result = runAntiImitationGuard({ ...valid, beforeContext: [{ sourceId: "source-private", text: "x".repeat(1001) }], generatedText: "Old Kingdom red moon over glass sea", generatedNgrams: ["red moon over glass sea"], generatedSemanticNeighbors: ["0.97"] }); expect(result.status).toBe("blocked"); expect(result.actions).toEqual(expect.arrayContaining(["isolate", "rewrite", "abstract"])); });
  it("requires evidence and never accepts author preference as bypass", () => { const result = runAntiImitationGuard({ ...valid, sourceRefs: [], bypassRequested: true }); expect(result.status).toBe("blocked"); expect(result.issues).toContain("GUARD_EVIDENCE_REQUIRED"); });
  it("blocks synonymically rewritten structural imitation", () => {
    const result = runAntiImitationGuard({ ...valid,
      sourceStructuralSignature: { eventSkeleton: ["debtor seeks archive", "guardian hides key", "archive burns"], revealOrder: ["debt", "key", "fire"], relationshipMappings: ["debtor->guardian:trust", "guardian->archive:protects"], imageryChain: ["red moon", "glass sea"] },
      generatedStructuralSignature: { eventSkeleton: ["borrower searches records", "warden conceals key", "records ignite"], revealOrder: ["debt", "key", "fire"], relationshipMappings: ["borrower->warden:trust", "warden->records:protects"], imageryChain: ["crimson moon", "transparent ocean"] }
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(expect.arrayContaining(["STRUCTURAL_EVENT_SKELETON_MATCH", "REVEAL_ORDER_MATCH", "RELATIONSHIP_MAPPING_MATCH", "IMAGERY_CHAIN_MATCH"]));
    expect(result.actions).toContain("abstract");
  });
});
