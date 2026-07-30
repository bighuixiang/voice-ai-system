import { describe, expect, it } from "vitest";
import { recordWorldRuleException, settleWorldRuleException } from "./worldRuleException.js";

const valid = { exceptionId: "exception-1", ruleId: "seal-rule", trigger: "bloodline resonance", informedParties: ["archivist"], repeatability: "one-time" as const, cost: "loses a year of life", proseEvidenceRefs: ["chapter://5#exception"], explanationWindow: "before volume end", sourceRefs: ["chapter://5"] };

describe("world rule exception", () => {
  it("creates explanation debt instead of rewriting the rule", () => {
    const result = recordWorldRuleException(valid);
    expect(result.status).toBe("open");
    expect(result.explanationDebtId).toBe("debt-exception-1");
  });

  it("requires concrete costs and evidence", () => {
    expect(() => recordWorldRuleException({ ...valid, cost: "" })).toThrow("WORLD_RULE_EXCEPTION_COST_REQUIRED");
    expect(() => recordWorldRuleException({ ...valid, proseEvidenceRefs: [] })).toThrow("WORLD_RULE_EXCEPTION_EVIDENCE_REQUIRED");
  });

  it("settles debt only with an explanation window evidence", () => {
    const exception = recordWorldRuleException(valid);
    expect(() => settleWorldRuleException(exception, { explanationRefs: [] })).toThrow("WORLD_RULE_EXCEPTION_SETTLEMENT_EVIDENCE_REQUIRED");
    const settled = settleWorldRuleException(exception, { explanationRefs: ["chapter://8#explanation"] });
    expect(settled.status).toBe("settled");
  });
});
