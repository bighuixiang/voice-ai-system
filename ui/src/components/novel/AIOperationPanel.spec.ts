import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AIOperationPanel from "./AIOperationPanel.vue";
import type { NovelTask } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["loading"],
    emits: ["click"],
    template: `<button :data-loading="loading" @click="$emit('click')"><slot /></button>`
  },
  "el-icon": { template: "<span><slot /></span>" },
  "el-tag": { template: "<span><slot /></span>" },
  Collection: true,
  DataAnalysis: true,
  Edit: true,
  Finished: true,
  MagicStick: true
};

const task: NovelTask = {
  id: "task-1",
  type: "chapter.draft",
  status: "success",
  projectId: "demo",
  inputSummary: "chapter-001",
  outputSummary: "Draft ready",
  startedAt: "2026-06-03T00:00:00.000Z",
  result: {
    summary: "Draft ready",
    content: "Chapter draft",
    changes: [],
    risks: [],
    questions: [],
    patches: [{ target: "chapters/chapter-001.md", mode: "replace-file", content: "Chapter draft" }]
  }
};

describe("AIOperationPanel", () => {
  it("emits task types from action buttons", async () => {
    const wrapper = mount(AIOperationPanel, {
      props: { task: null, loading: false },
      global: { stubs }
    });

    await wrapper.findAll("button")[0].trigger("click");

    expect(wrapper.emitted("run-task")?.[0]).toEqual(["outline.generate"]);
  });

  it("shows task output and emits patch application", async () => {
    const wrapper = mount(AIOperationPanel, {
      props: { task, loading: false },
      global: { stubs }
    });
    const buttons = wrapper.findAll("button");

    await buttons[buttons.length - 1].trigger("click");

    expect(wrapper.text()).toContain("Draft ready");
    expect(wrapper.text()).toContain("Chapter draft");
    expect(wrapper.emitted("apply-patches")).toHaveLength(1);
  });
});
