import { describe, expect, it } from "vitest";
import { buildRetrievalEligibility } from "./taskContextRetrieval.js";

describe("task retrieval eligibility", () => {
  it("preserves selected and excluded knowledge evidence from context blocks", () => {
    const eligibility = buildRetrievalEligibility([
      {
        title: "Knowledge Memory Index",
        content: JSON.stringify({
          projectionType: "knowledge-index",
          facts: [{ id: "fact-current" }],
          triples: [{ id: "triple-current" }],
          relatedFacts: [{ id: "fact-related" }],
          relatedTriples: [],
          excluded: [
            { id: "fact-future", reason: "MEMORY_CLAIM_NOT_ACTIVE_AT_TARGET_EVENT" },
            { id: "fact-secret", reason: "READER_KNOWLEDGE_REQUIRED" }
          ]
        })
      }
    ]);

    expect(eligibility).toMatchObject({ schemaVersion: "retrieval-eligibility.v1", status: "warn", selectedIds: ["fact-current", "triple-current", "fact-related"] });
    expect(eligibility.excluded).toEqual([
      { id: "fact-future", reason: "MEMORY_CLAIM_NOT_ACTIVE_AT_TARGET_EVENT" },
      { id: "fact-secret", reason: "READER_KNOWLEDGE_REQUIRED" }
    ]);
    expect(eligibility.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
