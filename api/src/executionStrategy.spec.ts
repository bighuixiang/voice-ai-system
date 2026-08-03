import { describe, expect, it } from "vitest";
import { buildAuthorExecutionStrategy, buildCostSavingPlan, evaluateExecutorFailover } from "./executionStrategy.js";

describe("execution strategy governance", () => {
  it("saves in value order without sacrificing protected invariants", () => {
    const plan = buildCostSavingPlan({ budgetPressure: "tight", cacheAvailable: true, duplicateContext: true, optionalAudit: true, t0Protected: true, highImpactReviewProtected: true });
    expect(plan.actions.slice(0, 2)).toEqual(["reuse-cache", "deduplicate-context"]);
    expect(plan.protectedInvariants).toEqual(expect.arrayContaining(["T0-context", "high-impact-independent-review"]));
  });
  it("blocks failover across capability or privacy boundaries", () => {
    expect(evaluateExecutorFailover({ currentCapabilityRef: "provider-a", candidateCapabilityRef: "provider-b", taskType: "understanding", requiredTier: "high", candidateTier: "balanced", contextCapacityOk: true, structuredOutput: true, privacyOk: true, rightsOk: true, residencyOk: true, inputFingerprint: "input" }).status).toBe("blocked");
    expect(evaluateExecutorFailover({ currentCapabilityRef: "provider-a", candidateCapabilityRef: "provider-b", taskType: "understanding", requiredTier: "high", candidateTier: "high", contextCapacityOk: true, structuredOutput: true, privacyOk: true, rightsOk: true, residencyOk: true, inputFingerprint: "input" }).status).toBe("allowed");
  });
  it("keeps author preferences below safety invariants and explains upgrades", () => {
    expect(buildAuthorExecutionStrategy("fast")).toMatchObject({ candidateLimit: 1, optionalChecks: "reduced", safetyInvariants: expect.arrayContaining(["canon-write-gate"]) });
  });
});
