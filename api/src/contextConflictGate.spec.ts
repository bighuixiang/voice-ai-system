import { describe, expect, it } from "vitest";
import { evaluateContextFacts } from "./contextConflictGate.js";

describe("context fact deduplication and conflict preservation", () => {
  it("deduplicates equivalent projections but preserves conflicting valid facts", () => {
    const result = evaluateContextFacts({ facts: [
      { factKey: "hero.alive", value: true, sourceRef: "canon://chapter-3", sourceVersion: "v3", authority: "canon", valid: true },
      { factKey: "hero.alive", value: true, sourceRef: "sqlite://summary-3", sourceVersion: "v1", authority: "summary", valid: true },
      { factKey: "hero.alive", value: false, sourceRef: "canon://chapter-2", sourceVersion: "v2", authority: "canon", valid: true }
    ] });
    expect(result.status).toBe("block");
    expect(result.deduplicated).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].values).toEqual(expect.arrayContaining([true, false]));
    expect(result.authorityOrder).toEqual(["canon", "projection", "summary"]);
  });

  it("ignores invalid records only when they are explicitly marked invalid", () => {
    const result = evaluateContextFacts({ facts: [{ factKey: "hero.alive", value: false, sourceRef: "old", sourceVersion: "v0", authority: "summary", valid: false }] });
    expect(result.status).toBe("pass");
    expect(result.invalidIgnored).toEqual(["old"]);
  });
});
