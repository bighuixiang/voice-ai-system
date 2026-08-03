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

  it("blocks summary and ledger projections from canon-sensitive purposes", () => {
    const result = evaluateContextSources({
      purpose: "canon-generation",
      query: "where is hero",
      sources: [
        source({ blockId: "summary-1", sourceRef: "summary://1", authority: "summary", selectionReason: "nearby" }),
        source({ blockId: "ledger-1", sourceRef: "ledger://1", authority: "summary", selectionReason: "ledger hit" })
      ]
    });
    expect(result.status).toBe("block");
    expect(result.selectedBlockIds).toEqual([]);
    expect(result.excluded).toEqual(expect.arrayContaining([
      { blockId: "summary-1", reason: "LEGACY_PROJECTION_NOT_CANON_AUTHORITY" },
      { blockId: "ledger-1", reason: "LEGACY_PROJECTION_NOT_CANON_AUTHORITY" }
    ]));
  });

  it("blocks model and imported sources from canon-sensitive purposes", () => {
    const result = evaluateContextSources({
      purpose: "canon-generation",
      query: "where is hero",
      sources: [
        source({ blockId: "model-1", authority: "model", sourceRef: "model://draft/1", selectionReason: "model suggestion" }),
        source({ blockId: "imported-1", authority: "imported", sourceRef: "import://sample/1", selectionReason: "imported sample" })
      ]
    });

    expect(result.status).toBe("block");
    expect(result.selectedBlockIds).toEqual([]);
    expect(result.excluded).toEqual(expect.arrayContaining([
      { blockId: "model-1", reason: "UNTRUSTED_AUTHORITY_NOT_CANON" },
      { blockId: "imported-1", reason: "UNTRUSTED_AUTHORITY_NOT_CANON" }
    ]));
  });

  it("rejects unverifiable source metadata before selection", () => {
    expect(() => evaluateContextSources({ purpose: "understanding", query: "hero", sources: [source({ sourceVersion: "", selectionReason: "nearby" })] })).toThrow("CONTEXT_SOURCE_FIELDS_INVALID");
  });
});
