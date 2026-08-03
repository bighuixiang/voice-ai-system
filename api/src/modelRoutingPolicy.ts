import crypto from "node:crypto";

export type CapabilityTier = "economy" | "balanced" | "high";
export type AuthorModelPreference = "fast" | "balanced" | "quality";
export interface RoutableModelCapability { capabilityId: string; modelId: string; capabilityTier: CapabilityTier; contextLimit: number; outputLimit: number; structuredOutput: boolean; verifiedTaskTypes: string[]; status: "active" | "retired"; }
export interface ModelRouteDecision { schemaVersion: "model-route-decision.v1"; status: "selected" | "blocked"; capabilityId?: string; modelId?: string; preferenceApplied: boolean; reason: string; reasonCode?: "CAPABILITY_OR_BUDGET_UNAVAILABLE"; estimatedCost: number; fingerprint: string; }
export interface ExecutionStrategySummary { schemaVersion: "execution-strategy-summary.v1"; before: { estimatedCost: number; estimatedLatencyMs: number; escalationConditions: string[] }; after?: { actualCost: number; actualLatencyMs: number; deviation: number }; fingerprint: string; }

const rank: Record<CapabilityTier, number> = { economy: 1, balanced: 2, high: 3 };
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function buildExecutionStrategySummary(input: { estimatedCost: number; estimatedLatencyMs: number; escalationConditions: readonly string[]; actualCost?: number; actualLatencyMs?: number }): ExecutionStrategySummary { if (![input.estimatedCost, input.estimatedLatencyMs].every((value) => Number.isFinite(value) && value >= 0) || input.escalationConditions.some((condition) => !condition.trim()) || (input.actualCost !== undefined && (!Number.isFinite(input.actualCost) || input.actualCost < 0)) || (input.actualLatencyMs !== undefined && (!Number.isFinite(input.actualLatencyMs) || input.actualLatencyMs < 0))) throw new Error("EXECUTION_STRATEGY_SUMMARY_INVALID"); const after = input.actualCost === undefined || input.actualLatencyMs === undefined ? undefined : { actualCost: input.actualCost, actualLatencyMs: input.actualLatencyMs, deviation: Number((input.actualCost - input.estimatedCost).toFixed(6)) }; const base = { schemaVersion: "execution-strategy-summary.v1" as const, before: { estimatedCost: input.estimatedCost, estimatedLatencyMs: input.estimatedLatencyMs, escalationConditions: [...input.escalationConditions] }, ...(after ? { after } : {}) }; return { ...base, fingerprint: hash(base) }; }
export function assertModelCapabilityRegistration(capability: RoutableModelCapability): RoutableModelCapability { if (!capability.capabilityId.trim() || !capability.modelId.trim() || !["economy", "balanced", "high"].includes(capability.capabilityTier) || !Number.isInteger(capability.contextLimit) || capability.contextLimit < 1 || !Number.isInteger(capability.outputLimit) || capability.outputLimit < 1 || !capability.verifiedTaskTypes.length || capability.verifiedTaskTypes.some((task) => !task.trim()) || !["active", "retired"].includes(capability.status)) throw new Error("MODEL_CAPABILITY_REGISTRATION_INVALID"); return capability; }

export function routeModelCapability(input: { taskType: string; impact: "low" | "medium" | "high"; requiredCapabilityTier: CapabilityTier; authorPreference: AuthorModelPreference; estimatedCost: number; remainingBudget: number; capabilities: RoutableModelCapability[] }): ModelRouteDecision {
  if (!input.taskType.trim() || !Number.isFinite(input.estimatedCost) || !Number.isFinite(input.remainingBudget) || input.estimatedCost < 0 || input.remainingBudget < 0) throw new Error("MODEL_ROUTE_INPUT_INVALID");
  input.capabilities.forEach(assertModelCapabilityRegistration);
  const eligible = input.capabilities.filter((capability) => capability.status === "active" && capability.verifiedTaskTypes.includes(input.taskType) && capability.structuredOutput && rank[capability.capabilityTier] >= rank[input.requiredCapabilityTier]);
  const ordered = [...eligible].sort((a, b) => rank[a.capabilityTier] - rank[b.capabilityTier]);
  const forcedHigh = input.impact === "high" || input.requiredCapabilityTier === "high";
  const selected = forcedHigh
    ? ordered.find((capability) => capability.capabilityTier === "high")
    : input.authorPreference === "quality" ? ordered.at(-1) : input.authorPreference === "balanced" ? ordered[Math.floor((ordered.length - 1) / 2)] : ordered[0];
  const blocked = !selected || input.estimatedCost > input.remainingBudget;
  const base = blocked
    ? { schemaVersion: "model-route-decision.v1" as const, status: "blocked" as const, preferenceApplied: false, reason: !selected ? "No active verified capability meets the required tier." : "Estimated cost exceeds remaining budget; no call may start.", reasonCode: "CAPABILITY_OR_BUDGET_UNAVAILABLE" as const, estimatedCost: input.estimatedCost }
    : { schemaVersion: "model-route-decision.v1" as const, status: "selected" as const, capabilityId: selected.capabilityId, modelId: selected.modelId, preferenceApplied: !forcedHigh, reason: forcedHigh ? "high-impact task requires a verified high-capability model; author preference cannot lower the safety floor." : "selected the lowest verified capability meeting the task floor for lower cost." , estimatedCost: input.estimatedCost };
  return { ...base, fingerprint: hash(base) };
}
