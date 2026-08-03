import { describe, expect, it } from "vitest";
import { evaluateModelContextBudget } from "./modelContextBudget.js";

describe("model context budget", () => {
  it("reserves output and tool capacity before admitting input", () => {
    expect(evaluateModelContextBudget({ modelContextTokens: 1000, inputTokens: 700, outputReserveTokens: 200, toolReserveTokens: 100 })).toMatchObject({ status: "pass", availableInputTokens: 700 });
  });

  it("blocks input that would consume output or tool reserve", () => {
    expect(evaluateModelContextBudget({ modelContextTokens: 1000, inputTokens: 701, outputReserveTokens: 200, toolReserveTokens: 100 })).toMatchObject({ status: "block", reason: "CONTEXT_TOKEN_BUDGET_EXCEEDED" });
  });

  it("rejects invalid negative budgets", () => {
    expect(() => evaluateModelContextBudget({ modelContextTokens: 100, inputTokens: 10, outputReserveTokens: -1, toolReserveTokens: 1 })).toThrow("CONTEXT_BUDGET_INPUT_INVALID");
  });
});
