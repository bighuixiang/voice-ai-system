import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { consumeExplorationBudget, createExplorationBudget, createLearningPolicy, pauseExplorationBudget, readExplorationBudget, readLearningPolicy } from "./learningBudget.js";

async function rootFixture() { return fs.mkdtemp(path.join(os.tmpdir(), "learning-budget-")); }

describe("learning policy and exploration budget", () => {
  it("creates conservative defaults with an explicit rollback version", async () => {
    const root = await rootFixture();
    const policy = await createLearningPolicy({ root, projectSlug: "demo", rollbackVersion: "policy-v1" });
    expect(policy).toMatchObject({ minIndependentEvidence: 2, privacyBoundary: "project-only", rollbackVersion: "policy-v1" });
  });

  it("consumes budget idempotently and hard-stops at probe or cost limits", async () => {
    const root = await rootFixture();
    const budget = await createExplorationBudget({ root, projectSlug: "demo", scope: "chapter-1", maxProbes: 2, maxCost: 10, maxImpact: "chapter-1", stopConditions: ["author-correction"] });
    const first = await consumeExplorationBudget({ root, budgetId: budget.budgetId, operationId: "probe-1", probes: 1, cost: 4, impact: "chapter-1" });
    expect(first.usedProbes).toBe(1);
    expect(await consumeExplorationBudget({ root, budgetId: budget.budgetId, operationId: "probe-1", probes: 1, cost: 4, impact: "chapter-1" })).toEqual(first);
    await expect(consumeExplorationBudget({ root, budgetId: budget.budgetId, operationId: "probe-2", probes: 1, cost: 7, impact: "chapter-1" })).rejects.toThrow("EXPLORATION_BUDGET_COST_EXCEEDED");
    await expect(consumeExplorationBudget({ root, budgetId: budget.budgetId, operationId: "probe-2", probes: 2, cost: 1, impact: "chapter-1" })).rejects.toThrow("EXPLORATION_BUDGET_PROBES_EXCEEDED");
  });

  it("blocks impact outside the declared scope and preserves a paused budget", async () => {
    const root = await rootFixture();
    const budget = await createExplorationBudget({ root, projectSlug: "demo", scope: "chapter-1", maxProbes: 3, maxCost: 10, maxImpact: "chapter-1", stopConditions: [] });
    await expect(consumeExplorationBudget({ root, budgetId: budget.budgetId, operationId: "probe-outside", probes: 1, cost: 1, impact: "chapter-2" })).rejects.toThrow("EXPLORATION_BUDGET_IMPACT_OUT_OF_SCOPE");
    const paused = await pauseExplorationBudget({ root, budgetId: budget.budgetId, reason: "author requested review" });
    expect(paused.status).toBe("paused");
    expect((await readExplorationBudget(root, budget.budgetId))?.pauseReason).toBe("author requested review");
    await expect(consumeExplorationBudget({ root, budgetId: budget.budgetId, operationId: "probe-paused", probes: 1, cost: 1, impact: "chapter-1" })).rejects.toThrow("EXPLORATION_BUDGET_NOT_ACTIVE");
  });
  it("fails closed when policy or budget persistence is tampered", async () => {
    const root = await rootFixture();
    const policy = await createLearningPolicy({ root, projectSlug: "demo", rollbackVersion: "policy-v1" });
    const policyPath = path.join(root, "sessions", "learning-policies", "demo.json");
    const policyValue = JSON.parse(await fs.readFile(policyPath, "utf8"));
    await fs.writeFile(policyPath, JSON.stringify({ ...policyValue, confidenceThreshold: 0.2 }), "utf8");
    await expect(readLearningPolicy(root, "demo")).rejects.toThrow("LEARNING_POLICY_INTEGRITY_FAILED");
    const budget = await createExplorationBudget({ root, projectSlug: "demo", scope: "chapter-1", maxProbes: 2, maxCost: 10, maxImpact: "chapter-1", stopConditions: [] });
    const budgetPath = path.join(root, "sessions", "exploration-budgets", `${budget.budgetId}.json`);
    const budgetValue = JSON.parse(await fs.readFile(budgetPath, "utf8"));
    await fs.writeFile(budgetPath, JSON.stringify({ ...budgetValue, usedProbes: 99 }), "utf8");
    await expect(readExplorationBudget(root, budget.budgetId)).rejects.toThrow("EXPLORATION_BUDGET_INTEGRITY_FAILED");
    expect(policy.policyId).toContain("learning-policy");
  });
});
