import { describe, expect, it } from "vitest";
import { captureAuthorUtterance, buildStorySeedFrame, createSeedInterpretationSet } from "./storySeed.js";

describe("story seed compilation", () => {
  it("captures the exact utterance with an idempotency key before interpretation", () => {
    const utterance = captureAuthorUtterance({ projectId: "demo", text: "A courier finds a door beneath the sea.", idempotencyKey: "m-1" });
    expect(utterance.text).toBe("A courier finds a door beneath the sea.");
    expect(utterance.status).toBe("captured");
    expect(utterance.idempotencyKey).toBe("m-1");
  });

  it("keeps facets evidence-bound and absent facts unknown", () => {
    const frame = buildStorySeedFrame({ utterance: captureAuthorUtterance({ projectId: "demo", text: "A courier finds a door beneath the sea.", idempotencyKey: "m-2" }), facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }, { facet: "desire", value: "unknown", evidence: [] }] });
    expect(frame.facets.find((item) => item.facet === "desire")?.certainty).toBe("unknown");
    expect(() => buildStorySeedFrame({ utterance: frame.utterance, facets: [{ facet: "trauma", value: "secret trauma", evidence: [] }] })).toThrow("SEED_EVIDENCE_REQUIRED");
  });

  it("preserves divergent interpretations and common facts without choosing canon", () => {
    const frame = buildStorySeedFrame({ utterance: captureAuthorUtterance({ projectId: "demo", text: "A courier finds a door beneath the sea.", idempotencyKey: "m-3" }), facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }] });
    const set = createSeedInterpretationSet({ frame, interpretations: [{ interpretationId: "i-1", differences: ["door is portal"], downstreamImpact: ["world rules"], supports: ["door"], contradictions: [] }, { interpretationId: "i-2", differences: ["door is wreck"], downstreamImpact: ["mystery"], supports: ["sea"], contradictions: [] }] });
    expect(set.status).toBe("unresolved");
    expect(set.commonFacets).toContain("protagonist");
  });
});
