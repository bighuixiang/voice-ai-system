import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BackgroundJobPanel from "./BackgroundJobPanel.vue";
import type { BackgroundJob } from "@/types/novel";

const stubs = {
  "el-button": {
    emits: ["click"],
    template: `<button class="job-button" @click="$emit('click')"><slot /></button>`
  },
  "el-tag": {
    props: ["type"],
    template: `<span class="job-tag"><slot /></span>`
  },
  "el-tooltip": {
    template: `<span class="tooltip-stub"><slot /></span>`
  }
};

const jobs: BackgroundJob[] = [
  {
    id: "job-2",
    projectId: "demo",
    type: "story.graph.rebuild",
    status: "running",
    inputSummary: "{}",
    startedAt: "2026-06-11T00:01:00.000Z",
    updatedAt: "2026-06-11T00:01:00.000Z"
  },
  {
    id: "job-1",
    projectId: "demo",
    type: "knowledge.index.rebuild",
    status: "success",
    inputSummary: "{}",
    outputSummary: "1 facts / 0 relations",
    resultRef: "/api/novel/projects/demo/knowledge/index",
    startedAt: "2026-06-11T00:00:00.000Z",
    finishedAt: "2026-06-11T00:00:01.200Z",
    durationMs: 1200,
    updatedAt: "2026-06-11T00:00:01.200Z"
  },
  {
    id: "job-3",
    projectId: "demo",
    type: "quality.series.rebuild",
    status: "error",
    inputSummary: "{}",
    error: "quality failed",
    startedAt: "2026-06-11T00:02:00.000Z",
    finishedAt: "2026-06-11T00:02:01.000Z",
    updatedAt: "2026-06-11T00:02:01.000Z"
  },
  {
    id: "job-4",
    projectId: "demo",
    type: "knowledge.index.rebuild",
    status: "cancelled",
    inputSummary: "{}",
    outputSummary: "Cancelled before start.",
    startedAt: "2026-06-11T00:03:00.000Z",
    finishedAt: "2026-06-11T00:03:00.000Z",
    updatedAt: "2026-06-11T00:03:00.000Z"
  }
];

describe("BackgroundJobPanel", () => {
  it("renders recent jobs and emits refresh", async () => {
    const wrapper = mount(BackgroundJobPanel, {
      props: {
        jobs,
        isLoading: false
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("后台作业");
    expect(wrapper.text()).toContain("4 个任务 / 1 个运行中");
    expect(wrapper.text()).toContain("故事图谱重建");
    expect(wrapper.text()).toContain("知识索引重建");
    expect(wrapper.text()).toContain("全书质量重建");
    expect(wrapper.text()).toContain("失败");
    expect(wrapper.text()).toContain("已取消");
    expect(wrapper.text()).toContain("1 facts / 0 relations");
    expect(wrapper.text()).toContain("1.2s");

    await wrapper.findAll(".job-button")[0].trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);

    const actionButtons = wrapper.findAll(".job-actions .job-button");
    await actionButtons[0].trigger("click");
    await actionButtons[1].trigger("click");
    await actionButtons[2].trigger("click");

    expect(wrapper.emitted("cancel")?.[0]).toEqual(["job-2"]);
    expect(wrapper.emitted("retry")?.[0]).toEqual(["job-3"]);
    expect(wrapper.emitted("retry")?.[1]).toEqual(["job-4"]);
  });

  it("shows an empty state before jobs exist", () => {
    const wrapper = mount(BackgroundJobPanel, {
      props: {
        jobs: []
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("暂无后台作业。");
    expect(wrapper.text()).toContain("查看重建任务运行结果");
  });
});
