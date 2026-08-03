import { describe, expect, it } from "vitest";
import { assertModelCapabilityRegistration, buildExecutionStrategySummary, routeModelCapability } from "./modelRoutingPolicy.js";

const caps = [
  { capabilityId: "mini", modelId: "gpt-mini", capabilityTier: "economy" as const, contextLimit: 8000, outputLimit: 1000, structuredOutput: true, verifiedTaskTypes: ["extract"], status: "active" as const },
  { capabilityId: "deep", modelId: "gpt-deep", capabilityTier: "high" as const, contextLimit: 32000, outputLimit: 4000, structuredOutput: true, verifiedTaskTypes: ["creative-understanding"], status: "active" as const }
];

describe("model routing policy", () => {
  it("routes high-impact understanding to verified high capability despite fast preference", () => {
    const result = routeModelCapability({ taskType: "creative-understanding", impact: "high", requiredCapabilityTier: "high", authorPreference: "fast", estimatedCost: 5, remainingBudget: 100, capabilities: caps });
    expect(result).toMatchObject({ status: "selected", capabilityId: "deep", preferenceApplied: false });
    expect(result.reason).toContain("high-impact");
  });

  it("allows economy routing only for verified low-risk tasks and explains savings", () => {
    const result = routeModelCapability({ taskType: "extract", impact: "low", requiredCapabilityTier: "economy", authorPreference: "fast", estimatedCost: 1, remainingBudget: 10, capabilities: caps });
    expect(result).toMatchObject({ status: "selected", capabilityId: "mini", preferenceApplied: true });
    expect(result.reason).toContain("lower cost");
  });

  it("applies quality preference within the required safety floor", () => {
    const balanced = { capabilityId: "balanced", modelId: "gpt-balanced", capabilityTier: "balanced" as const, contextLimit: 16000, outputLimit: 2000, structuredOutput: true, verifiedTaskTypes: ["extract"], status: "active" as const };
    const result = routeModelCapability({ taskType: "extract", impact: "low", requiredCapabilityTier: "economy", authorPreference: "quality", estimatedCost: 1, remainingBudget: 10, capabilities: [...caps, balanced] });
    expect(result).toMatchObject({ status: "selected", capabilityId: "balanced", preferenceApplied: true });
  });

  it("blocks when no verified capability satisfies the task", () => {
    expect(routeModelCapability({ taskType: "creative-understanding", impact: "high", requiredCapabilityTier: "high", authorPreference: "quality", estimatedCost: 5, remainingBudget: 2, capabilities: caps })).toMatchObject({ status: "blocked", reasonCode: "CAPABILITY_OR_BUDGET_UNAVAILABLE" });
  });
  it("rejects incomplete registry entries before routing", () => { expect(() => assertModelCapabilityRegistration({ ...caps[0], contextLimit: 0 })).toThrow("MODEL_CAPABILITY_REGISTRATION_INVALID"); expect(() => routeModelCapability({ taskType: "extract", impact: "low", requiredCapabilityTier: "economy", authorPreference: "fast", estimatedCost: 1, remainingBudget: 10, capabilities: [{ ...caps[0], verifiedTaskTypes: [""] }] })).toThrow("MODEL_CAPABILITY_REGISTRATION_INVALID"); });
  it("explains execution cost before the call and deviation after it", () => { const summary = buildExecutionStrategySummary({ estimatedCost: 1.2, estimatedLatencyMs: 500, escalationConditions: ["structured output invalid", "budget threshold reached"], actualCost: 1.5, actualLatencyMs: 700 }); expect(summary.before.escalationConditions).toHaveLength(2); expect(summary.after?.deviation).toBe(0.3); expect(() => buildExecutionStrategySummary({ estimatedCost: -1, estimatedLatencyMs: 1, escalationConditions: [] })).toThrow("EXECUTION_STRATEGY_SUMMARY_INVALID"); });
});
