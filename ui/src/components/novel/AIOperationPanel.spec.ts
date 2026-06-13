import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AIOperationPanel from "./AIOperationPanel.vue";
import type { AiStageDefinition, NovelTask } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["loading", "disabled"],
    emits: ["click"],
    template: `<button :data-loading="loading" :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-form": { template: "<form @submit.prevent><slot /></form>" },
  "el-form-item": { template: "<label><slot /></label>" },
  "el-input": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<textarea :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-icon": { template: "<span><slot /></span>" },
  "el-tag": { template: "<span><slot /></span>" },
  Collection: true,
  DataAnalysis: true,
  Edit: true,
  Finished: true,
  MagicStick: true,
  CircleClose: true
};

const task: NovelTask = {
  id: "task-1",
  type: "chapter.draft",
  status: "success",
  projectId: "demo",
  inputSummary: "chapter-001",
  outputSummary: "草稿已生成",
  startedAt: "2026-06-03T00:00:00.000Z",
  result: {
    summary: "草稿已生成",
    content: "章节草稿",
    changes: [],
    risks: [],
    questions: [],
    patches: [{ target: "chapters/chapter-001.md", mode: "replace-file", content: "章节草稿" }]
  }
};

const stages: AiStageDefinition[] = [
  {
    key: "pipeline.chapter.prose",
    label: "Chapter prose drafting",
    taskTypes: ["chapter.draft"]
  },
  {
    key: "autopilot.post_chapter.recap",
    label: "Post chapter recap",
    taskTypes: ["writing.recap"]
  }
];

describe("AIOperationPanel", () => {
  it("emits task types from action buttons", async () => {
    const wrapper = mount(AIOperationPanel, {
      props: { task: null, progress: [], loading: false },
      global: { stubs }
    });

    await wrapper.findAll("button")[0].trigger("click");
    await wrapper.findAll("button")[3].trigger("click");
    await wrapper.findAll("button")[4].trigger("click");

    expect(wrapper.emitted("run-task")?.[0]).toEqual(["outline.generate"]);
    expect(wrapper.emitted("run-task")?.[1]).toEqual(["writing.briefing"]);
    expect(wrapper.emitted("run-task")?.[2]).toEqual(["writing.recap"]);
  });

  it("shows task output and emits patch application", async () => {
    const wrapper = mount(AIOperationPanel, {
      props: { task, progress: [], loading: false },
      global: { stubs }
    });
    const buttons = wrapper.findAll("button");

    await buttons[buttons.length - 1].trigger("click");

    expect(wrapper.text()).toContain("草稿已生成");
    expect(wrapper.text()).toContain("章节草稿");
    expect(wrapper.text()).toContain("已完成");
    expect(wrapper.emitted("apply-patches")).toHaveLength(1);
  });

  it("renders actions without repeated stage subtitles or English keys", () => {
    const wrapper = mount(AIOperationPanel, {
      props: { task: null, progress: [], loading: false, stages },
      global: { stubs }
    });

    expect(wrapper.find(".action-stage").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Chapter prose drafting");
    expect(wrapper.text()).not.toContain("pipeline.chapter.prose");
    expect(wrapper.text()).not.toContain("autopilot.post_chapter.recap");
  });

  it("shows the active stage beside task progress in Chinese", () => {
    const wrapper = mount(AIOperationPanel, {
      props: {
        task: null,
        activeTaskType: "chapter.draft",
        progress: [{ id: "codex", label: "Running AI", status: "running" }],
        loading: true,
        stages
      },
      global: { stubs }
    });

    const progressStage = wrapper.find(".progress-stage");

    expect(progressStage.text()).toContain("当前阶段：起草正文");
    expect(progressStage.text()).not.toContain("pipeline.chapter.prose");
    expect(wrapper.text()).toContain("调用 AI 执行器");
  });

  it("only shows loading on the active action", () => {
    const wrapper = mount(AIOperationPanel, {
      props: {
        task: null,
        activeTaskType: "chapter.draft",
        progress: [],
        loading: true,
        stages
      },
      global: { stubs }
    });

    const buttons = wrapper.findAll("button");

    expect(buttons[2].attributes("data-loading")).toBe("true");
    expect(buttons[0].attributes("data-loading")).toBe("false");
  });

  it("emits cancel for a running task", async () => {
    const wrapper = mount(AIOperationPanel, {
      props: {
        task: { ...task, status: "running", result: undefined },
        progress: [{ id: "codex", label: "Running AI", status: "running" }],
        loading: true
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("运行中");

    await wrapper.find(".panel-title-actions button").trigger("click");

    expect(wrapper.emitted("cancel-task")).toHaveLength(1);
  });

  it("emits an ad-hoc AI instruction", async () => {
    const wrapper = mount(AIOperationPanel, {
      props: {
        task: null,
        progress: [{ id: "codex", label: "调用 Codex CLI", status: "running" }],
        loading: false
      },
      global: { stubs }
    });

    await wrapper.find("textarea").setValue("检查升级节奏。");
    await wrapper.findAll("button").at(-1)?.trigger("click");

    expect(wrapper.text()).toContain("调用 AI 执行器");
    expect(wrapper.emitted("run-task")?.at(-1)).toEqual(["assistant.free", { instruction: "检查升级节奏。" }]);
  });
});
