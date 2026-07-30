import { describe, expect, it } from "vitest";
import { planWorldRuleDisclosure } from "./worldRuleDisclosure.js";

const valid = { disclosureId: "disclosure-1", ruleId: "seal-rule", actionId: "choice-1", observableFacts: ["the seal dims near water"], readerKnowledge: "reader saw the seal dim", characterKnowledge: ["hero knows the seal is old"], objectiveTruth: "water suppresses the seal", requiredForChoice: true, hiddenUntil: "chapter-8", clueRefs: ["chapter://3#dim"] , evidenceRefs: ["scene://3"] };

describe("world rule disclosure", () => {
  it("discloses only observable facts needed for the current choice", () => {
    const result = planWorldRuleDisclosure(valid);
    expect(result.status).toBe("fair");
    expect(result.readerVisible).toEqual(["the seal dims near water"]);
  });

  it("blocks a hidden solution rule without reader clue evidence", () => {
    expect(() => planWorldRuleDisclosure({ ...valid, clueRefs: [], hiddenUntil: "chapter-8" })).toThrow("WORLD_RULE_READER_FAIRNESS_REQUIRED");
  });

  it("allows non-choice world truth to remain hidden without encyclopedia dumping", () => {
    const result = planWorldRuleDisclosure({ ...valid, requiredForChoice: false, observableFacts: [], clueRefs: [] });
    expect(result.status).toBe("hidden");
    expect(result.readerVisible).toEqual([]);
  });
});
