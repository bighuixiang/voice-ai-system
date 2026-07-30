import { describe, expect, it } from "vitest";
import { recordWorldRuleKnowledge } from "./worldRuleKnowledge.js";

describe("world rule knowledge layers", () => {
  it("keeps a character belief separate from objective rule truth", () => {
    const result = recordWorldRuleKnowledge({ ruleId: "rule-1", subjectId: "hero", kind: "character_belief", claim: "the power is divine", sourceRefs: ["dialogue://hero"] });
    expect(result.kind).toBe("character_belief");
    expect(result.canonEligible).toBe(false);
    expect(result.truthStatus).toBe("belief");
  });

  it("allows canon eligibility only for explicit objective evidence", () => {
    const result = recordWorldRuleKnowledge({ ruleId: "rule-1", subjectId: "author", kind: "objective_canon", claim: "the anchor folds a path", sourceRefs: ["canon://rule-1"] });
    expect(result.canonEligible).toBe(true);
    expect(result.truthStatus).toBe("objective");
  });

  it("preserves unknown and competing claims instead of choosing latest", () => {
    const result = recordWorldRuleKnowledge({ ruleId: "rule-1", subjectId: "reader", kind: "unknown", claim: "uncertain", sourceRefs: ["chapter://1"] });
    expect(result.truthStatus).toBe("unknown");
    expect(result.canonEligible).toBe(false);
  });
});
