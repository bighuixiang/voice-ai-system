import { describe, expect, it } from "vitest";
import { evaluateWorldRuleAdmission } from "./worldRuleAdmission.js";

const valid = { candidateId: "candidate-1", ruleId: "blink-step", sourceRefs: ["chapter://2#hint"], solvesCurrentProblem: "crosses the sealed gap", prerequisites: ["marked anchor"], foreshadowingRefs: ["chapter://1#symbol"], boundaries: ["only between marked anchors", "one use per day"], futureCosts: ["memory loss"], existingRuleImpacts: ["competes with gate license"], introductionContext: "midpoint discovery", evidenceRefs: ["chapter://2#scene"] };

describe("world rule admission", () => {
  it("admits a prepared rule with explicit fairness boundaries", () => {
    const result = evaluateWorldRuleAdmission(valid);
    expect(result.status).toBe("admitted");
    expect(result.candidateType).toBe("world-rule");
  });

  it("blocks a climax-only rule that solves the problem without setup", () => {
    const result = evaluateWorldRuleAdmission({ ...valid, foreshadowingRefs: [], introductionContext: "climax" });
    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining(["ADMISSION_FORESHADOWING_REQUIRED", "ADMISSION_CLIMAX_RULE_BLOCKED"]));
  });

  it("allows pure texture detail without escalating to a rule candidate", () => {
    const result = evaluateWorldRuleAdmission({ ...valid, candidateType: "texture", solvesCurrentProblem: "", prerequisites: [], boundaries: [], futureCosts: [], existingRuleImpacts: [] });
    expect(result.status).toBe("not-applicable");
  });
});
