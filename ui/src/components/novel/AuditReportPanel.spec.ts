import { describe, expect, it } from "vitest";
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
    byStatus: { pending: 0, running: 0, success: 2, error: 1, cancelled: 0 },
    byType: { "chapter.draft": 2, "writing.recap": 1 },
    latestTasks: []
  },
  aiInvocationSummary: {
    total: 2,
    byDecision: { pending: 0, accepted: 1, rejected: 0, "not-required": 1 },
    proposedPatchCount: 2,
    acceptedPatchCount: 1
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
  it("renders audit report summaries and emits actions", async () => {
    const wrapper = mount(AuditReportPanel, {
      props: { report, loading: false },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("Demo Novel");
    expect(wrapper.text()).toContain("1 chapters");
    expect(wrapper.text()).toContain("82");
    expect(wrapper.text()).toContain("3 tasks");
    expect(wrapper.text()).toContain("2 invocations");
    expect(wrapper.text()).toContain("local");
    expect(wrapper.text()).toContain("6 vectors");
    expect(wrapper.text()).toContain("1 blocked");
    expect(wrapper.text()).toContain("review 1");
    expect(wrapper.text()).toContain("2 jobs");
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

    expect(wrapper.text()).toContain("No audit report loaded");
  });
});
