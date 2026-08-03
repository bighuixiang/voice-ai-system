import { describe, expect, it } from "vitest";
import { createResearchSourceSnapshot } from "./researchGrounding.js";
import { evaluateResearchSourceReliability } from "./researchReliability.js";

const source = (id: string, hash: string, signals: string[]) => createResearchSourceSnapshot({ sourceId: id, sourceType: "web", author: "Agency", title: id, publishedAt: "2025-01-01", retrievedAt: "2026-07-31", region: "CN", locator: `https://${id}.test`, contentHash: hash, acquisition: "browser", rights: "quote-with-attribution", reliabilitySignals: signals, expiry: "2027-01-01", rawContent: "fact" });

describe("research source reliability", () => {
  it("blocks a source without a required primary reliability signal", () => {
    const result = evaluateResearchSourceReliability({ source: source("weak", "h-weak", ["blog"]), corroboratingSources: [], requiredSignals: ["official"], minIndependentSources: 0 });
    expect(result).toMatchObject({ status: "insufficient", reasons: ["REQUIRED_RELIABILITY_SIGNAL_MISSING"] });
  });

  it("does not count copied content as independent corroboration", () => {
    const result = evaluateResearchSourceReliability({ source: source("primary", "same", ["official"]), corroboratingSources: [source("copy", "same", ["secondary"]), source("independent", "different", ["peer-reviewed"])], requiredSignals: ["official"], minIndependentSources: 2 });
    expect(result.status).toBe("insufficient");
    expect(result.reasons).toContain("INDEPENDENT_CORROBORATION_INSUFFICIENT");
    expect(result.independentSourceCount).toBe(1);
  });

  it("passes a current primary source with enough independent evidence", () => {
    const result = evaluateResearchSourceReliability({ source: source("primary", "h-primary", ["official", "primary"]), corroboratingSources: [source("independent-a", "h-a", ["peer-reviewed"]), source("independent-b", "h-b", ["institutional"])], requiredSignals: ["official", "primary"], minIndependentSources: 2 });
    expect(result).toMatchObject({ status: "eligible", independentSourceCount: 2, reasons: [] });
  });
});
