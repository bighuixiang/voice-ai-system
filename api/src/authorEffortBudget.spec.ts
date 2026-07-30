import { describe, expect, it } from "vitest";
import { consumeAuthorEffort, createAuthorEffortBudget, applyAuthorEffortPreference } from "./authorEffortBudget.js";

describe("author effort budget", () => {
  it("provides phase-specific limits and blocks over-budget interruptions", () => {
    const budget = createAuthorEffortBudget({ projectSlug: "p1", phase: "exploration" });
    expect(budget.limits.activeQuestions).toBeGreaterThan(0);
    const consumed = consumeAuthorEffort(budget, { kind: "active-question", amount: budget.limits.activeQuestions + 1, reason: "low-value question" });
    expect(consumed.status).toBe("blocked");
    expect(consumed.reason).toBe("effort-budget-exceeded");
  });

  it("supports an explicit less-question preference without silently disabling hard gates", () => {
    const budget = createAuthorEffortBudget({ projectSlug: "p1", phase: "exploration" });
    const adjusted = applyAuthorEffortPreference(budget, "less-questioning");
    expect(adjusted.limits.activeQuestions).toBeLessThan(budget.limits.activeQuestions);
    expect(adjusted.strategyVersion).not.toBe(budget.strategyVersion);
    expect(consumeAuthorEffort(adjusted, { kind: "hard-gate", amount: 1, reason: "L2 ending decision" }).status).toBe("allowed");
  });

  it("records usage and preserves an auditable receipt", () => {
    const budget = createAuthorEffortBudget({ projectSlug: "p1", phase: "audit" });
    const result = consumeAuthorEffort(budget, { kind: "review-item", amount: 2, reason: "review milestone" });
    expect(result.status).toBe("allowed");
    expect(result.receipt).toMatchObject({ kind: "review-item", amount: 2, reason: "review milestone" });
    expect(result.budget.used.reviewItems).toBe(2);
  });
});
