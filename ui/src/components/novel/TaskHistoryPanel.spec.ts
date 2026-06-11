import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TaskHistoryPanel from "./TaskHistoryPanel.vue";
import type { AiInvocationSession, AiStageDefinition, NovelTask } from "@/types/novel";

const stubs = {
  "el-empty": { template: "<div />" },
  "el-button": {
    props: ["loading", "size"],
    emits: ["click"],
    template: `<button :data-loading="loading" @click="$emit('click')"><slot /></button>`
  },
  "el-tag": { template: "<span><slot /></span>" }
};

describe("TaskHistoryPanel", () => {
  it("renders readable AI stage labels while keeping the stable stage key", async () => {
    const task: NovelTask = {
      id: "task-1",
      type: "chapter.draft",
      status: "success",
      projectId: "demo",
      inputSummary: "{}",
      outputSummary: "Draft complete",
      startedAt: "2026-06-11T00:00:00.000Z",
      finishedAt: "2026-06-11T00:01:00.000Z"
    };
    const invocation: AiInvocationSession = {
      id: "invocation-1",
      taskId: "task-1",
      projectId: "demo",
      taskType: "chapter.draft",
      stageKey: "pipeline.chapter.prose",
      status: "success",
      agentProfileId: "codex-cli",
      agentProvider: "codex",
      modelId: "gpt-5",
      promptSnapshot: { length: 1200, preview: "prompt preview", contextTitles: ["Project", "Chapter"] },
      contextSnapshot: {
        blockCount: 3,
        totalChars: 2400,
        blocks: [
          { title: "Project", length: 800 },
          { title: "Chapter", length: 1600 }
        ]
      },
      attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z", durationMs: 60000, exitCode: 0 },
      adoptionDecision: "accepted",
      proposedPatchTargets: ["chapters/chapter-001.md"],
      acceptedPatchTargets: ["chapters/chapter-001.md"],
      commitResult: { historyAppended: true, invocationAppended: true },
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:01:00.000Z"
    };
    const stages: AiStageDefinition[] = [
      { key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] }
    ];

    const wrapper = mount(TaskHistoryPanel, {
      props: { tasks: [task], invocations: [invocation], stages, canExport: true },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("Chapter prose drafting");
    expect(wrapper.text()).toContain("pipeline.chapter.prose");
    expect(wrapper.text()).toContain("codex/gpt-5");
    expect(wrapper.text()).toContain("2.4k");
    expect(wrapper.text()).toContain("Prompt 1.2k");
    expect(wrapper.text()).toContain("60.0s");
    expect(wrapper.text()).toContain("Project");
    expect(wrapper.text()).toContain("Chapter");
    expect(wrapper.text()).toContain("prompt preview");
    expect(wrapper.text()).toContain("chapters/chapter-001.md");
    expect(wrapper.text()).toContain("JSON");

    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");
    await buttons[1].trigger("click");
    expect(wrapper.emitted("preview-report")).toHaveLength(1);
    expect(wrapper.emitted("export-report")).toHaveLength(1);
  });
});
