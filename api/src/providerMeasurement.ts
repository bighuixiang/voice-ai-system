import type { CodexRunOutput } from "./codexRunner.js";

export interface NormalizedProviderMeasurement {
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number; measurement: "actual" | "estimated" };
  cost: { amount: number; currency: string; measurement: "actual" | "estimated"; pricingRef?: string; estimateMethod?: string };
  modelVersion?: string;
  usageSource: string;
}

function validNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizeProviderMeasurement(input: { output: Pick<CodexRunOutput, "usage" | "cost" | "modelVersion">; promptChars: number; outputChars: number; fallbackCurrency?: string; explicitCostCents?: number }): NormalizedProviderMeasurement {
  const nativeUsage = input.output.usage;
  const nativeCost = input.output.cost;
  const hasActualUsage = Boolean(nativeUsage && validNonNegative(nativeUsage.inputTokens) && validNonNegative(nativeUsage.outputTokens) && validNonNegative(nativeUsage.cachedTokens) && nativeUsage.measurement === "actual");
  const hasActualCost = Boolean(nativeCost && validNonNegative(nativeCost.amount) && nativeCost.measurement === "actual" && nativeCost.pricingRef?.trim());
  const usage = hasActualUsage
    ? { inputTokens: nativeUsage!.inputTokens, outputTokens: nativeUsage!.outputTokens, cachedTokens: nativeUsage!.cachedTokens, measurement: "actual" as const }
    : { inputTokens: Math.ceil(input.promptChars / 4), outputTokens: Math.ceil(input.outputChars / 4), cachedTokens: 0, measurement: "estimated" as const };
  if (hasActualCost && hasActualUsage) {
    return { usage, cost: { amount: nativeCost!.amount, currency: nativeCost!.currency, measurement: "actual", pricingRef: nativeCost!.pricingRef }, modelVersion: input.output.modelVersion, usageSource: nativeUsage!.source || "provider-native" };
  }
  const estimatedCents = input.explicitCostCents !== undefined ? input.explicitCostCents : Math.max(1, Math.ceil((input.promptChars + input.outputChars) / 4000));
  if (!Number.isInteger(estimatedCents) || estimatedCents < 0) throw new Error("MODEL_INVOCATION_ESTIMATE_INVALID");
  return {
    usage,
    cost: { amount: estimatedCents / 100, currency: nativeCost?.currency || input.fallbackCurrency || "USD", measurement: "estimated", estimateMethod: nativeUsage || nativeCost ? "provider-native-data-incomplete" : "character-count-minimum-cent" },
    modelVersion: input.output.modelVersion,
    usageSource: nativeUsage?.source || "estimated"
  };
}
