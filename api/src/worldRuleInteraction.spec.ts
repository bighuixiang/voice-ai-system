import { describe, expect, it } from "vitest";
import { evaluateWorldRuleInteraction, replayWorldRuleInteraction } from "./worldRuleInteraction.js";

const valid = { interactionId: "interaction-1", ruleIds: ["fire", "rain"], priorityOrder: ["rain", "fire"], operation: "suppress" as const, observedEffect: "fire quenched", uncertainty: [], evidenceRefs: ["scene://9#effect"] };

describe("world rule interaction", () => {
  it("records priority and a replayable adopted interaction", () => {
    const result = evaluateWorldRuleInteraction(valid);
    expect(result.status).toBe("adopted");
    expect(result.replayEventId).toBe("replay-interaction-1");
    expect(replayWorldRuleInteraction(result).observedEffect).toBe("fire quenched");
  });

  it("keeps unresolved conflicts as unknown candidates", () => {
    const result = evaluateWorldRuleInteraction({ ...valid, operation: "conflict", observedEffect: "", uncertainty: ["which rule dominates"] });
    expect(result.status).toBe("unknown");
    expect(result.candidates).toHaveLength(2);
  });

  it("blocks adoption without a concrete replay evidence", () => {
    expect(() => evaluateWorldRuleInteraction({ ...valid, evidenceRefs: [] })).toThrow("WORLD_RULE_INTERACTION_EVIDENCE_REQUIRED");
    expect(() => evaluateWorldRuleInteraction({ ...valid, priorityOrder: ["fire"] })).toThrow("WORLD_RULE_INTERACTION_PRIORITY_REQUIRED");
  });
});
