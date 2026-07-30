import { describe, expect, it } from "vitest";
import { evaluateContextPlan } from "./contextPlanGate.js";

const block = (overrides: Record<string, unknown> = {}) => ({ id: "t0-author", tier: "T0" as const, originalTokens: 100, finalTokens: 100, selected: true, sourceRefs: ["msg-1"], compressionCoverage: true, ...overrides });

describe("context plan gate", () => {
  it("passes a globally bounded plan with output and tool reserves", () => {
    const result = evaluateContextPlan({ modelContextTokens: 1000, outputReserveTokens: 200, toolReserveTokens: 100, blocks: [block(), block({ id: "t1-world", tier: "T1", originalTokens: 300, finalTokens: 300 })] });
    expect(result).toMatchObject({ status: "pass", inputTokens: 400, availableInputTokens: 700 });
  });

  it("blocks silent T0 truncation and global overflow", () => {
    expect(evaluateContextPlan({ modelContextTokens: 1000, outputReserveTokens: 200, toolReserveTokens: 100, blocks: [block({ finalTokens: 60, compressionCoverage: false })] })).toMatchObject({ status: "block", reasons: ["T0_TRUNCATION_UNPROVEN"] });
    expect(evaluateContextPlan({ modelContextTokens: 100, outputReserveTokens: 20, toolReserveTokens: 20, blocks: [block({ originalTokens: 70, finalTokens: 70 }), block({ id: "t1", tier: "T1", originalTokens: 70, finalTokens: 70 })] })).toMatchObject({ status: "block", reasons: ["CONTEXT_TOKEN_BUDGET_EXCEEDED"] });
  });

  it("requires an exclusion reason for omitted blocks", () => {
    expect(evaluateContextPlan({ modelContextTokens: 1000, outputReserveTokens: 100, toolReserveTokens: 100, blocks: [block({ selected: false, exclusionReason: "" })] })).toMatchObject({ status: "block", reasons: ["CONTEXT_EXCLUSION_UNEXPLAINED"] });
  });
});
