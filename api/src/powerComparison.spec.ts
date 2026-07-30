import { describe, expect, it } from "vitest";
import { comparePowerInContext } from "./powerComparison.js";

const base = { comparisonId: "fight-1", subjectA: "hero", subjectB: "warden", dimensions: ["skill", "environment", "preparation", "information", "resources", "counters"], environment: "narrow bridge", preparation: "ambush", information: "hero knows patrol route", resources: "one charge", counters: "warden armor", confidence: { min: 0.55, max: 0.8 }, evidenceRefs: ["scene://fight-1"] };

describe("power comparison", () => {
  it("retains context and uncertainty instead of a global power number", () => {
    const result = comparePowerInContext({ ...base, advantage: "subjectA", rationale: "bridge removes armor reach" });
    expect(result.verdict).toBe("subjectA-favored");
    expect(result.environment).toBe("narrow bridge");
    expect(result.confidence).toEqual({ min: 0.55, max: 0.8 });
    expect(result).not.toHaveProperty("powerScore");
  });

  it("allows a weaker side to win only with a traceable strategy and cost", () => {
    const result = comparePowerInContext({ ...base, advantage: "subjectA", rationale: "trap the armor at the bridge", strategyChoice: "cut the support rope", strategyEvidenceRefs: ["scene://fight-1#choice"], strategyCost: "injured shoulder" });
    expect(result.strategyChoice).toContain("support rope");
    expect(() => comparePowerInContext({ ...base, advantage: "subjectA", rationale: "strategy: surprise" })).toThrow("POWER_STRATEGY_EVIDENCE_REQUIRED");
  });

  it("preserves unknown when context or confidence is insufficient", () => {
    const result = comparePowerInContext({ ...base, environment: "", confidence: { min: 0, max: 0 }, advantage: "unknown", rationale: "not enough information" });
    expect(result.verdict).toBe("unknown");
  });
});
