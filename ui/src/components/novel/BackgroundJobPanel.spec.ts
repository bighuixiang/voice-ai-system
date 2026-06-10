import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BackgroundJobPanel from "./BackgroundJobPanel.vue";
import type { BackgroundJob } from "@/types/novel";

const stubs = {
  "el-button": {
    emits: ["click"],
    template: `<button class="refresh-button" @click="$emit('click')"><slot /></button>`
  },
  "el-tag": {
    props: ["type"],
    template: `<span class="job-tag"><slot /></span>`
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
    expect(wrapper.text()).toContain("2 个任务 / 1 个运行中");
    expect(wrapper.text()).toContain("故事图谱重建");
    expect(wrapper.text()).toContain("知识索引重建");
    expect(wrapper.text()).toContain("1 facts / 0 relations");
    expect(wrapper.text()).toContain("1.2s");

    await wrapper.find(".refresh-button").trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);
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
