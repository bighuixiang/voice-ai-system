import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CraftPatternPanel from "./CraftPatternPanel.vue";
import type { CraftExperiment, CraftPattern } from "@/types/novel";

const pattern: CraftPattern = { schemaVersion: "craft-pattern.v1", patternId: "pattern-1", projectSlug: "demo", name: "Scoped rhythm", mechanism: "shorten turns", narrativeFunction: "speed", applicability: ["chase"], counterexamples: ["reconciliation"], sourceEnvelopeIds: ["rights-1"], evidenceRefs: ["source://notes#1"], lifecycle: "probation", promotion: { experimentId: "experiment-1", actor: "author", reason: "first holdout", promotedAt: "2026-07-30T00:00:00.000Z" }, createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "pattern" };
const experiment: CraftExperiment = { schemaVersion: "craft-experiment.v1", experimentId: "experiment-2", projectSlug: "demo", transferPlanId: "plan-2", baselineCandidateId: "base", treatmentCandidateId: "treatment", holdoutSceneIds: ["scene-2"], targetMetrics: ["pressure"], budgetId: "budget-2", status: "judged", judgment: { evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "holdout", judgedAt: "2026-07-30T00:00:00.000Z", fingerprint: "judgment" }, createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "experiment" };

describe("CraftPatternPanel", () => {
  it("shows lifecycle, evidence, and explicit canon boundary", () => {
    const wrapper = mount(CraftPatternPanel, { props: { patterns: [pattern], experiments: { [experiment.experimentId]: experiment } } });
    expect(wrapper.text()).toContain("probation");
    expect(wrapper.text()).toContain("source://notes#1");
    expect(wrapper.text()).toContain("不会自动写入 canon");
  });

  it("emits validation only from a judged treatment experiment", async () => {
    const wrapper = mount(CraftPatternPanel, { props: { patterns: [pattern], experiments: { [experiment.experimentId]: experiment } } });
    await wrapper.get(`[data-testid='validate-pattern-${pattern.patternId}']`).trigger("click");
    expect(wrapper.emitted("validate")?.[0]).toEqual([pattern, experiment]);
  });

  it("exposes an explicit catalog refresh", async () => {
    const wrapper = mount(CraftPatternPanel);
    await wrapper.get("[data-testid='refresh-craft-catalog']").trigger("click");
    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });
});
