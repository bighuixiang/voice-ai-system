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
});
