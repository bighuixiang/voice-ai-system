import crypto from "node:crypto";

export interface ModelContextBudgetResult {
  schemaVersion: "model-context-budget.v1";
  status: "pass" | "block";
  modelContextTokens: number;
  inputTokens: number;
  outputReserveTokens: number;
  toolReserveTokens: number;
  availableInputTokens: number;
  reason?: "CONTEXT_TOKEN_BUDGET_EXCEEDED";
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateModelContextBudget(input: { modelContextTokens: number; inputTokens: number; outputReserveTokens: number; toolReserveTokens: number }): ModelContextBudgetResult {
  if (![input.modelContextTokens, input.inputTokens, input.outputReserveTokens, input.toolReserveTokens].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("CONTEXT_BUDGET_INPUT_INVALID");
  const availableInputTokens = Math.max(0, input.modelContextTokens - input.outputReserveTokens - input.toolReserveTokens);
  const base = input.inputTokens > availableInputTokens
    ? { schemaVersion: "model-context-budget.v1" as const, status: "block" as const, modelContextTokens: input.modelContextTokens, inputTokens: input.inputTokens, outputReserveTokens: input.outputReserveTokens, toolReserveTokens: input.toolReserveTokens, availableInputTokens, reason: "CONTEXT_TOKEN_BUDGET_EXCEEDED" as const }
    : { schemaVersion: "model-context-budget.v1" as const, status: "pass" as const, modelContextTokens: input.modelContextTokens, inputTokens: input.inputTokens, outputReserveTokens: input.outputReserveTokens, toolReserveTokens: input.toolReserveTokens, availableInputTokens };
  return { ...base, fingerprint: hash(base) };
}
