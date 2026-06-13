import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AuditReportPanel from "./AuditReportPanel.vue";
import type { ProjectAuditReport } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["loading"],
    emits: ["click"],
    template: `<button :data-loading="loading" @click="$emit('click')"><slot /></button>`
  },
  "el-empty": {
    props: ["description"],
    template: `<div class="empty">{{ description }}</div>`
  },
  "el-tag": {
    template: "<span><slot /></span>"
  }
};

const report: ProjectAuditReport = {
  projectSlug: "demo",
  projectTitle: "Demo Novel",
  generatedAt: "2026-06-11T00:00:00.000Z",
  chapters: [
    {
      id: "chapter-001",
      title: "Chapter 1",
      status: "drafted",
      contentPath: "chapters/chapter-001.md",
      outlinePath: "outline/chapter-001.md"
    }
  ],
  quality: {
    projectSlug: "demo",
    chapterCount: 1,
    reportCount: 1,
    averageOverallScore: 82,
    metricAverages: [],
    weakestChapters: [],
    updatedAt: "2026-06-11T00:00:00.000Z"
  },
  taskSummary: {
    total: 3,
    byStatus: { pending: 0, running: 0, success: 1, error: 1, cancelled: 1 },
    byType: { "chapter.draft": 2, "writing.recap": 1 },
    latestTasks: [
      {
        id: "task-error",
        type: "chapter.draft",
        status: "error",
        inputSummary: "{}",
        error: "Codex timed out",
        startedAt: "2026-06-11T00:00:00.000Z",
        finishedAt: "2026-06-11T00:10:00.000Z",
        durationMs: 600000,
        timeoutMs: 600000
      },
      {
        id: "task-cancelled",
        type: "writing.recap",
        status: "cancelled",
        inputSummary: "{}",
        startedAt: "2026-06-11T00:11:00.000Z",
        finishedAt: "2026-06-11T00:11:02.000Z",
        durationMs: 2000,
        timeoutMs: 600000,
        cancelRequestedAt: "2026-06-11T00:11:01.000Z"
      }
    ]
  },
  aiInvocationSummary: {
    total: 2,
    byDecision: { pending: 0, accepted: 1, rejected: 0, "not-required": 1 },
    proposedPatchCount: 2,
    acceptedPatchCount: 1,
    promptVersions: { "task-template:chapter.draft:v2": 2 },
    preCallWarnings: { "multiple-context-blocks-truncated": 1 },
    contextTierTotals: { T0: 2, T1: 4, T2: 3, T3: 1 },
    truncatedContextBlocks: [{ title: "World", count: 1 }]
  },
  knowledgeSummary: {
    factCount: 4,
    tripleCount: 2,
    indexedChapterCount: 1,
    keywordCount: 8,
    vectorSummary: {
      provider: "local",
      dimensions: 16,
      entryCount: 6,
      updatedAt: "2026-06-11T00:00:00.000Z"
    }
  },
  runtimeSummary: {
    chapterCount: 1,
    byActiveStep: { structure: 0, draft: 0, review: 1, recap: 0, ledger: 0, next: 0, none: 0 },
    blockedStepCount: 1,
    snapshots: []
  },
  backgroundJobSummary: {
    total: 2,
    byStatus: { pending: 0, running: 1, success: 1, error: 0, cancelled: 0 },
    latestJobs: [
      {
        id: "job-1",
        projectId: "demo",
        type: "knowledge.index.rebuild",
        status: "success",
        inputSummary: "{}",
        outputSummary: "4 facts / 2 relations",
        startedAt: "2026-06-11T00:00:00.000Z",
        finishedAt: "2026-06-11T00:00:01.000Z",
        durationMs: 1000,
        updatedAt: "2026-06-11T00:00:01.000Z"
      }
    ]
  },
  aiInvocations: []
};

describe("AuditReportPanel", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders audit report summaries and emits actions", async () => {
    const wrapper = mount(AuditReportPanel, {
      props: { report, loading: false },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("Demo Novel");
    expect(wrapper.text()).toContain("1 章");
    expect(wrapper.text()).toContain("82");
    expect(wrapper.text()).toContain("3 个任务");
    expect(wrapper.text()).toContain("任务健康");
    expect(wrapper.text()).toContain("失败 / 已取消");
    expect(wrapper.text()).toContain("设置超时预算");
    expect(wrapper.text()).toContain("Codex timed out");
    expect(wrapper.text()).toContain("已请求取消");
    expect(wrapper.text()).toContain("2 次调用");
    expect(wrapper.text()).toContain("AI 调用控制面板");
    expect(wrapper.text()).toContain("调用前预警");
    expect(wrapper.text()).toContain("1");
    expect(wrapper.text()).toContain("上下文压缩");
    expect(wrapper.text()).toContain("T0 2");
    expect(wrapper.text()).toContain("T1 4");
    expect(wrapper.text()).toContain("task-template:chapter.draft:v2 2");
    expect(wrapper.text()).toContain("multiple-context-blocks-truncated 1");
    expect(wrapper.text()).toContain("local");
    expect(wrapper.text()).toContain("6 个向量");
    expect(wrapper.text()).toContain("1 个阻塞");
    expect(wrapper.text()).toContain("review 1");
    expect(wrapper.text()).toContain("2 个任务");
    expect(wrapper.text()).toContain("4 facts / 2 relations");

    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");
    await buttons[1].trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);
    expect(wrapper.emitted("download")).toHaveLength(1);
  });

  it("shows an empty state before a report is loaded", () => {
    const wrapper = mount(AuditReportPanel, {
      props: { report: null, loading: false },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("尚未加载审计报告");
  });

  it("focuses the AI Control Plane section when requested", async () => {
    const wrapper = mount(AuditReportPanel, {
      props: { report, loading: false, focusSection: "ai-control-plane" },
      global: { stubs }
    });

    await wrapper.vm.$nextTick();

    const section = wrapper.find("#audit-ai-control-plane");
    expect(section.exists()).toBe(true);
    expect(section.classes()).toContain("is-focus-highlight");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
