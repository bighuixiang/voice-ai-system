import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import CreationLoopPanel from "./CreationLoopPanel.vue";
import type { CreationLoopStep, CreationRuntimeSnapshot } from "@/types/novel";

const steps: CreationLoopStep[] = [
  {
    id: "draft",
    label: "正文",
    status: "done",
    detail: "正文已保存。",
    metric: "1200 字",
    action: "open-focus",
    actionLabel: "去写作"
  },
  {
    id: "review",
    label: "审稿",
    status: "active",
    detail: "等待体检。",
    signals: ["情绪待入账 2"],
    action: "diagnose",
    actionLabel: "体检本章"
  }
];

const runtimeSnapshot: CreationRuntimeSnapshot = {
  projectSlug: "demo",
  chapterId: "chapter-001",
  chapterTitle: "Chapter 1",
  activeStepId: "review",
  fingerprint: "abcdef1234567890",
  steps: [
    {
      id: "review",
      label: "审稿",
      status: "active",
      detail: "后端快照判定审稿中。",
      metric: "待体检"
    }
  ],
  signals: {
    wordCount: 1200,
    sceneCount: 2,
    hasDashboard: true,
    hasChapterSummary: false,
    hasQualityReport: false,
    hasWritingRecap: false,
    acceptedLedgerCount: 0
  },
  updatedAt: "2026-06-11T00:00:00.000Z"
};

const global = {
  stubs: {
    "el-button": {
      emits: ["click"],
      template: `<button :disabled="$attrs.disabled" @click="$emit('click')"><slot /></button>`
    },
    "el-icon": { template: "<span><slot /></span>" },
    ArrowRight: true,
    CircleCheck: true,
    Loading: true,
    Warning: true
  }
};

describe("CreationLoopPanel", () => {
  it("shows the runtime snapshot active step without replacing local steps", () => {
    const wrapper = mount(CreationLoopPanel, {
      props: { steps, runtimeSnapshot },
      global
    });

    expect(wrapper.text()).toContain("review · 1200 字 · #abcdef12");
    expect(wrapper.text()).toContain("1 / 2 已沉淀");
    expect(wrapper.text()).toContain("进行中 1");
    expect(wrapper.text()).toContain("正文已保存。");
    expect(wrapper.text()).toContain("情绪待入账 2");
  });

  it("emits the selected creation loop action", async () => {
    const wrapper = mount(CreationLoopPanel, {
      props: { steps },
      global
    });

    await wrapper.findAll("button")[0].trigger("click");

    expect(wrapper.emitted("action")).toEqual([["open-focus"]]);
  });

  it("shows next actions and risk signals as the runtime command surface", async () => {
    const wrapper = mount(CreationLoopPanel, {
      props: {
        steps,
        nextActions: [
          {
            id: "save-draft",
            priority: "critical",
            label: "保存正文",
            reason: "未保存会阻塞后续流水线。",
            action: "save-draft"
          },
          {
            id: "diagnose",
            priority: "recommended",
            label: "体检本章",
            reason: "缺少质量报告。",
            action: "diagnose"
          }
        ],
        riskSignals: [
          {
            id: "draft-save",
            label: "正文未保存",
            status: "blocked",
            reason: "先保存正文。",
            action: "save-draft",
            actionLabel: "保存",
            source: "draft"
          }
        ]
      },
      global
    });

    expect(wrapper.text()).toContain("必须先做");
    expect(wrapper.text()).toContain("保存正文");
    expect(wrapper.text()).toContain("正文未保存");

    await wrapper.find(".next-action-card button").trigger("click");

    expect(wrapper.emitted("action")?.[0]).toEqual(["save-draft"]);
  });

  it("does not emit blocked actions", async () => {
    const wrapper = mount(CreationLoopPanel, {
      props: {
        steps: [
          {
            id: "review",
            label: "审稿",
            status: "blocked",
            detail: "先保存正文。",
            action: "diagnose",
            actionLabel: "体检本章"
          }
        ]
      },
      global
    });
    const clickSpy = vi.spyOn(wrapper.vm, "$emit");

    await wrapper.find("button").trigger("click");

    expect(wrapper.text()).toContain("阻塞 1");
    expect(clickSpy).not.toHaveBeenCalledWith("action", "diagnose");
  });
});
