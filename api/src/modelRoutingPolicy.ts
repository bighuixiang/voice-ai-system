import crypto from "node:crypto";

export type CapabilityTier = "economy" | "balanced" | "high";
export type AuthorModelPreference = "fast" | "balanced" | "quality";
export interface RoutableModelCapability { capabilityId: string; modelId: string; capabilityTier: CapabilityTier; contextLimit: number; outputLimit: number; structuredOutput: boolean; verifiedTaskTypes: string[]; status: "active" | "retired"; }
export interface ModelRouteDecision { schemaVersion: "model-route-decision.v1"; status: "selected" | "blocked"; capabilityId?: string; modelId?: string; preferenceApplied: boolean; reason: string; reasonCode?: "CAPABILITY_OR_BUDGET_UNAVAILABLE"; estimatedCost: number; fingerprint: string; }

const rank: Record<CapabilityTier, number> = { economy: 1, balanced: 2, high: 3 };
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function routeModelCapability(input: { taskType: string; impact: "low" | "medium" | "high"; requiredCapabilityTier: CapabilityTier; authorPreference: AuthorModelPreference; estimatedCost: number; remainingBudget: number; capabilities: RoutableModelCapability[] }): ModelRouteDecision {
  if (!input.taskType.trim() || !Number.isFinite(input.estimatedCost) || !Number.isFinite(input.remainingBudget) || input.estimatedCost < 0 || input.remainingBudget < 0) throw new Error("MODEL_ROUTE_INPUT_INVALID");
  const eligible = input.capabilities.filter((capability) => capability.status === "active" && capability.verifiedTaskTypes.includes(input.taskType) && capability.structuredOutput && rank[capability.capabilityTier] >= rank[input.requiredCapabilityTier]);
  const ordered = [...eligible].sort((a, b) => rank[a.capabilityTier] - rank[b.capabilityTier]);
  const forcedHigh = input.impact === "high" || input.requiredCapabilityTier === "high";
  const selected = forcedHigh ? ordered.find((capability) => capability.capabilityTier === "high") : ordered[0];
  const blocked = !selected || input.estimatedCost > input.remainingBudget;
  const base = blocked
    ? { schemaVersion: "model-route-decision.v1" as const, status: "blocked" as const, preferenceApplied: false, reason: !selected ? "No active verified capability meets the required tier." : "Estimated cost exceeds remaining budget; no call may start.", reasonCode: "CAPABILITY_OR_BUDGET_UNAVAILABLE" as const, estimatedCost: input.estimatedCost }
    : { schemaVersion: "model-route-decision.v1" as const, status: "selected" as const, capabilityId: selected.capabilityId, modelId: selected.modelId, preferenceApplied: !forcedHigh, reason: forcedHigh ? "high-impact task requires a verified high-capability model; author preference cannot lower the safety floor." : "selected the lowest verified capability meeting the task floor for lower cost." , estimatedCost: input.estimatedCost };
  return { ...base, fingerprint: hash(base) };
}
