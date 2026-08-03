import crypto from "node:crypto";

export type ContextPlanTier = "T0" | "T1" | "T2" | "T3";
export interface ContextPlanBlock {
  id: string;
  tier: ContextPlanTier;
  originalTokens: number;
  finalTokens: number;
  selected: boolean;
  sourceRefs: string[];
  compressionCoverage: boolean;
  exclusionReason?: string;
}
export interface ContextPlanResult {
  schemaVersion: "context-plan-gate.v1";
  status: "pass" | "warn" | "block";
  modelContextTokens: number;
  outputReserveTokens: number;
  toolReserveTokens: number;
  availableInputTokens: number;
  inputTokens: number;
  reasons: string[];
  tokenEstimation: "tokenizer" | "conservative-character-fallback";
  estimationErrorAssumption: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateContextPlan(input: { modelContextTokens: number; outputReserveTokens: number; toolReserveTokens: number; blocks: ContextPlanBlock[]; tokenEstimation?: "tokenizer" | "conservative-character-fallback"; estimationErrorAssumption?: string }): ContextPlanResult {
  if (![input.modelContextTokens, input.outputReserveTokens, input.toolReserveTokens].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("CONTEXT_PLAN_LIMITS_INVALID");
  const reasons: string[] = [];
  for (const block of input.blocks) {
    if (!block.id.trim() || !block.sourceRefs.length || block.originalTokens < 0 || block.finalTokens < 0 || block.finalTokens > block.originalTokens) throw new Error("CONTEXT_PLAN_BLOCK_INVALID");
    if (!block.selected && !block.exclusionReason?.trim()) reasons.push("CONTEXT_EXCLUSION_UNEXPLAINED");
    if (block.selected && block.tier === "T0" && block.finalTokens < block.originalTokens && !block.compressionCoverage) reasons.push("T0_TRUNCATION_UNPROVEN");
  }
  const availableInputTokens = Math.max(0, input.modelContextTokens - input.outputReserveTokens - input.toolReserveTokens);
  const inputTokens = input.blocks.filter((block) => block.selected).reduce((sum, block) => sum + block.finalTokens, 0);
  if (inputTokens > availableInputTokens) reasons.push("CONTEXT_TOKEN_BUDGET_EXCEEDED");
  if (input.outputReserveTokens + input.toolReserveTokens > input.modelContextTokens) reasons.push("CONTEXT_RESERVES_EXCEED_MODEL_WINDOW");
  const tokenEstimation = input.tokenEstimation || "conservative-character-fallback";
  const estimationErrorAssumption = (input.estimationErrorAssumption || (tokenEstimation === "tokenizer" ? "provider-tokenizer" : "characters-per-token conservative fallback")).trim();
  if (!estimationErrorAssumption) throw new Error("CONTEXT_TOKEN_ESTIMATION_ASSUMPTION_REQUIRED");
  const base = { schemaVersion: "context-plan-gate.v1" as const, status: reasons.length ? "block" as const : "pass" as const, modelContextTokens: input.modelContextTokens, outputReserveTokens: input.outputReserveTokens, toolReserveTokens: input.toolReserveTokens, availableInputTokens, inputTokens, reasons, tokenEstimation, estimationErrorAssumption };
  return { ...base, fingerprint: hash(base) };
}
