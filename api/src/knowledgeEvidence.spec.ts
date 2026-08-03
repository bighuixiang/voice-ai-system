import { describe, expect, it } from "vitest";
import type { KnowledgeFact, KnowledgeTriple } from "./types.js";
import { buildKnowledgeEvidenceProfile, evidenceQualityPriority } from "./knowledgeEvidence.js";

const fact = (input: Partial<KnowledgeFact> & Pick<KnowledgeFact, "id" | "text" | "source">): KnowledgeFact => ({
  chapterIds: [],
  relatedEntities: [],
  keywords: [],
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...input
});

describe("knowledge evidence profile", () => {
  it("gives canon anchors priority over derived sources even when derived text scores higher", () => {
    expect(evidenceQualityPriority("canon")).toBeGreaterThan(evidenceQualityPriority("derived"));
  });

  it("counts independent canon and derived families instead of counting duplicate projections", () => {
    const facts = [
      fact({ id: "fact:canon", text: "canon anchor", chapterIds: ["chapter-1"], source: { type: "memory-claim", id: "claim-canon" } }),
      fact({ id: "summary:chapter-1", text: "same anchor in summary", chapterIds: ["chapter-1"], source: { type: "chapter-summary", id: "chapter-1" } }),
      fact({ id: "summary-event:chapter-1:1", text: "same anchor event", chapterIds: ["chapter-1"], source: { type: "chapter-summary", id: "chapter-1" } }),
      fact({ id: "summary:chapter-2", text: "independent summary", chapterIds: ["chapter-2"], source: { type: "chapter-summary", id: "chapter-2" } })
    ];
    const triples: KnowledgeTriple[] = [{ id: "triple:summary", subject: "hero", predicate: "knows", object: "anchor", chapterIds: ["chapter-1"], sourceFactIds: ["summary:chapter-1"], updatedAt: "2026-08-03T00:00:00.000Z" }];

    const profile = buildKnowledgeEvidenceProfile({ facts, triples, selectedIds: ["fact:canon", "summary:chapter-1", "summary-event:chapter-1:1", "summary:chapter-2", "triple:summary"], canonicalSourceIds: ["claim-canon"] });

    expect(profile.independentSourceCount).toBe(3);
    expect(profile.familyCount).toBe(3);
    expect(profile.duplicateDerivedGroupCount).toBe(1);
    expect(profile.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "claim-canon", quality: "canon", independent: true }),
      expect.objectContaining({ id: "chapter-1", quality: "derived", independent: true, derivedFromIds: expect.arrayContaining(["summary:chapter-1"]) }),
      expect.objectContaining({ id: "chapter-2", quality: "derived", independent: true })
    ]));
  });

  it("reports distinct evidence gaps without claiming an absent result is contradiction-free", () => {
    const profile = buildKnowledgeEvidenceProfile({
      facts: [],
      triples: [],
      selectedIds: [],
      excluded: [
        { id: "fact:permission", reason: "SOURCE_PERMISSION_REQUIRED" },
        { id: "fact:unknown-time", reason: "TARGET_EVENT_UNORDERED" },
        { id: "fact:extract", reason: "EXTRACTION_FAILED" },
        { id: "fact:conflict", reason: "CONTRADICTION_UNRESOLVED" }
      ],
      canonicalSourceIds: []
    });

    expect(profile.gaps).toEqual(expect.arrayContaining(["not-found", "permission-blocked", "time-unknown", "extraction-failed", "conflict"]));
    expect(profile.saysNoContradiction).toBe(false);
  });
});
