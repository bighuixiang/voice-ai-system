import { describe, expect, it } from "vitest";
import { evaluateContextSources } from "./contextSourceGate.js";

const source = (overrides: Record<string, unknown> = {}) => ({ blockId: "b-1", factKey: "hero.location", sourceRef: "canon://facts/1", sourceVersion: "v1", contentHash: "hash-1", authority: "canon" as const, relevance: 0.9, selected: true, selectionReason: "same chapter", ...overrides });

describe("context source gate", () => {
  it("deduplicates equivalent facts by authority and records purpose", () => {
    const result = evaluateContextSources({ purpose: "understanding", query: "where is hero", sources: [source(), source({ blockId: "b-2", sourceRef: "summary://1", authority: "summary", contentHash: "hash-1", relevance: 0.95, selectionReason: "nearby" })] });
    expect(result).toMatchObject({ status: "pass", selectedBlockIds: ["b-1"], excluded: [{ blockId: "b-2", reason: "DUPLICATE_LOWER_AUTHORITY" }] });
  });

  it("keeps conflicting facts visible and blocks unresolved conflicts", () => {
    const result = evaluateContextSources({ purpose: "understanding", query: "where is hero", sources: [source(), source({ blockId: "b-2", sourceRef: "canon://facts/2", contentHash: "hash-2", selectionReason: "contradicting evidence" })] });
    expect(result).toMatchObject({ status: "block", selectedBlockIds: ["b-1", "b-2"], conflicts: [{ factKey: "hero.location", blockIds: ["b-1", "b-2"] }] });
  });
});
