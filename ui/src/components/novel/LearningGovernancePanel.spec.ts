import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import LearningGovernancePanel from "./LearningGovernancePanel.vue";
import type { ExplorationBudget, LearningPolicy } from "@/types/novel";

const policy: LearningPolicy = { schemaVersion: "learning-policy.v1", policyId: "policy-1", projectSlug: "demo", minIndependentEvidence: 2, confidenceThreshold: 0.75, decayRate: 0.1, conflictStrategy: "weaken-and-split", explorationRatio: 0.1, privacyBoundary: "project-only", rollbackVersion: "v1", createdAt: "2026-07-30T00:00:00.000Z", fingerprint: "p" };
const budget: ExplorationBudget = { schemaVersion: "exploration-budget.v1", budgetId: "budget-1", projectSlug: "demo", scope: "chapter-1", maxProbes: 3, maxCost: 10, maxImpact: "chapter-1", stopConditions: ["author-correction"], usedProbes: 1, usedCost: 2, consumedOperationIds: ["probe-1"], status: "active", createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "b" };

describe("LearningGovernancePanel", () => {
  it("shows policy evidence and bounded budget state", () => {
    const wrapper = mount(LearningGovernancePanel, { props: { policy, budgets: { [budget.budgetId]: budget } } });
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("1 / 3");
    expect(wrapper.text()).toContain("author-correction");
  });

  it("emits a pause request for an active budget", async () => {
    const wrapper = mount(LearningGovernancePanel, { props: { budgets: { [budget.budgetId]: budget } } });
    await wrapper.get(`[data-testid='pause-budget-${budget.budgetId}']`).trigger("click");
    expect(wrapper.emitted("pause")?.[0]).toEqual([budget]);
  });
});
