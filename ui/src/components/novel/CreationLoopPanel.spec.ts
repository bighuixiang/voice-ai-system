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
    "el-drawer": {
      props: ["modelValue"],
      template: `<div v-if="modelValue" class="drawer-stub"><slot /></div>`
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

  it("opens risk source details and emits contextual commands", async () => {
    const wrapper = mount(CreationLoopPanel, {
      props: {
        steps,
        riskSignals: [
          {
            id: "context-ai",
            label: "AI 上下文截断",
            status: "watch",
            reason: "最近一次调用发生上下文压缩。",
            source: "ai",
            command: { type: "open-audit-report", section: "ai-control-plane" },
            commandLabel: "定位 AI 调用控制面板",
            detailRows: [{ id: "truncated", label: "截断块", value: "2", kind: "ai" }],
            sourceRefs: [{ id: "world", label: "被截断上下文", value: "World", kind: "ai" }]
          }
        ]
      },
      global
    });

    await wrapper.find(".risk-radar article").trigger("click");

    expect(wrapper.find(".drawer-stub").text()).toContain("来源明细");
    expect(wrapper.find(".drawer-stub").text()).toContain("截断块");
    expect(wrapper.find(".drawer-stub").text()).toContain("World");

    await wrapper.find(".drawer-actions button").trigger("click");

    expect(wrapper.emitted("command")).toEqual([[{ type: "open-audit-report", section: "ai-control-plane" }]]);
  });

  it("runs risk card shortcuts through contextual commands before legacy actions", async () => {
    const wrapper = mount(CreationLoopPanel, {
      props: {
        steps,
        riskSignals: [
          {
            id: "jobs-and-cast",
            label: "角色调度 1",
            status: "watch",
            reason: "Shadow 需要精确定位。",
            source: "graph",
            action: "open-structure",
            actionLabel: "定位",
            command: { type: "open-story-graph", characterId: "char-shadow", nodeId: "char-shadow", appearanceStatus: "should-appear" },
            commandLabel: "定位角色图谱"
          }
        ]
      },
      global
    });

    await wrapper.find(".risk-radar article button").trigger("click");

    expect(wrapper.emitted("command")).toEqual([
      [{ type: "open-story-graph", characterId: "char-shadow", nodeId: "char-shadow", appearanceStatus: "should-appear" }]
    ]);
    expect(wrapper.emitted("action")).toBeUndefined();
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
