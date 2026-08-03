import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PlotPilotLearningPanel from "./PlotPilotLearningPanel.vue";
import type { PlotPilotLearningItem } from "@/types/novel";

const items: PlotPilotLearningItem[] = [
  {
    id: "ai-control-plane",
    label: "AI 调用控制面板",
    status: "done",
    sourcePattern: "记录提示词版本、调用前预警和采纳结果。",
    localLanding: "审计报告暴露 AI 调用健康度。",
    userValue: "失败、截断和采纳状态都能追踪。",
    entryCommand: { type: "open-audit-report", section: "ai-control-plane" },
    evidenceCount: 2,
    active: true,
    activeReason: "最近调用已有提示词版本、预检或上下文截断记录。",
    sourceRefs: [
      { id: "invocation-1", label: "最近调用", value: "invocation-1", kind: "ai" },
      { id: "prompt", label: "提示词版本", value: "chapter-draft:v2", kind: "ai" }
    ]
  },
  {
    id: "emotion-ledger",
    label: "情绪账本",
    status: "planned",
    sourcePattern: "追踪情绪债务。",
    localLanding: "写作回顾",
    userValue: "把伤口延续到下一章。",
    entryAction: "request-recap",
    evidenceCount: 0
  }
];

describe("PlotPilotLearningPanel", () => {
  it("highlights active mechanisms and emits entry commands", async () => {
    const wrapper = mount(PlotPilotLearningPanel, {
      props: { items }
    });

    expect(wrapper.find(".is-active-mechanism").exists()).toBe(true);
    expect(wrapper.text()).toContain("正在发挥作用");
    expect(wrapper.text()).toContain("最近调用");
    expect(wrapper.text()).toContain("chapter-draft:v2");

    await wrapper.find(".is-active-mechanism button").trigger("click");

    expect(wrapper.emitted("command")).toEqual([[{ type: "open-audit-report", section: "ai-control-plane" }]]);
  });

  it("falls back to creation loop actions when no command is provided", async () => {
    const wrapper = mount(PlotPilotLearningPanel, {
      props: { items }
    });

    await wrapper.findAll("button")[1].trigger("click");

    expect(wrapper.emitted("action")).toEqual([["request-recap"]]);
  });

  it("shows experiment-only status when holdout or calibration evidence is missing", () => {
    const wrapper = mount(PlotPilotLearningPanel, {
      props: {
        items,
        experiments: [{
          schemaVersion: "craft-experiment.v1",
          experimentId: "experiment-ui-1",
          projectSlug: "demo",
          transferPlanId: "plan-1",
          baselineCandidateId: "baseline",
          treatmentCandidateId: "treatment",
          holdoutSceneIds: ["scene-1"],
          targetMetrics: ["pressure"],
          budgetId: "budget-1",
          status: "judged",
          judgment: { evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "reviewed", judgedAt: "2026-01-01T00:00:00.000Z", fingerprint: "judgment" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          fingerprint: "experiment"
        }]
      }
    });

    expect(wrapper.get('[data-testid="craft-release-status"]').text()).toContain("仅实验");
    expect(wrapper.text()).toContain("不会进入默认创作");
  });

  it("shows release review readiness only when all evidence classes are present", () => {
    const wrapper = mount(PlotPilotLearningPanel, {
      props: {
        items,
        experiments: [{
          schemaVersion: "craft-experiment.v1",
          experimentId: "experiment-ui-2",
          projectSlug: "demo",
          transferPlanId: "plan-2",
          baselineCandidateId: "baseline",
          treatmentCandidateId: "treatment",
          holdoutSceneIds: ["scene-1", "scene-2"],
          targetMetrics: ["reader-effect"],
          budgetId: "budget-2",
          status: "judged",
          holdoutValidation: { status: "cross-scene-validated", holdoutCaseIds: ["h1", "h2"], sceneFunctions: ["investigation", "aftermath"] },
          providerEvaluation: { providerRef: "provider://v1", decision: "pass", quality: { status: "calibrated" }, totalCost: { measurement: "actual" } },
          readerCalibration: { reviewerId: "reader-v1", status: "calibrated", humanSamples: 8, blind: true, agreementRate: 0.875 },
          judgment: { evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "reviewed", judgedAt: "2026-01-01T00:00:00.000Z", fingerprint: "judgment" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          fingerprint: "experiment"
        }]
      }
    });

    expect(wrapper.get('[data-testid="craft-release-status"]').text()).toContain("可进入发布审阅");
  });
});
