import { describe, expect, it } from "vitest";
import { createSafeSeedExploration, evaluateStoryContractReadiness, assessSeedConfidence, applyReversibleDefault } from "./seedReadiness.js";

describe("seed readiness safeguards", () => {
  it("continues useful near-term exploration without selecting an unresolved canon branch", () => {
    const result = createSafeSeedExploration({ interpretationIds: ["i-1", "i-2"], scope: "character-and-atmosphere", invalidationConditions: ["author selects a different world rule"] });
    expect(result.status).toBe("candidate");
    expect(result.appliesToInterpretations).toEqual(["i-1", "i-2"]);
    expect(result.isCanon).toBe(false);
  });

  it("computes minimum sufficiency for the requested product rather than all fields", () => {
    const result = evaluateStoryContractReadiness({ target: "structure-candidate", facets: { protagonist: "courier", desire: "open the door", resistance: "the tide", stakes: "save a sibling", experience: "dread and wonder", situation: "unknown" } });
    expect(result.ready).toBe(true);
    expect(result.unknown).toContain("situation");
  });

  it("separates coverage, evidence strength, conflicts and unknowns", () => {
    const result = assessSeedConfidence({ facets: [{ name: "protagonist", value: "courier", evidenceStrength: 1 }, { name: "desire", value: "unknown", evidenceStrength: 0 }], conflicts: ["ending"] });
    expect(result.coverage).toBe(0.5);
    expect(result.evidenceStrength).toBe(0.5);
    expect(result.conflicts).toEqual(["ending"]);
    expect(result.unknown).toContain("desire");
  });

  it("allows reversible presentation defaults but rejects core canon defaults", () => {
    expect(applyReversibleDefault({ field: "pov", value: "third-limited", source: "genre preference" }).reversible).toBe(true);
    expect(() => applyReversibleDefault({ field: "coreIdentity", value: "secret heir", source: "genre convention" })).toThrow("IRREVERSIBLE_DEFAULT_FORBIDDEN");
  });
});
