import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TaskHistoryPanel from "./TaskHistoryPanel.vue";
import type { AiInvocationSession, NovelTask } from "@/types/novel";

const stubs = {
  "el-empty": { template: "<div />" },
  "el-tag": { template: "<span><slot /></span>" }
};

describe("TaskHistoryPanel", () => {
  it("renders the stable AI stage key from invocation audit", () => {
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
      promptSnapshot: { length: 1200, preview: "prompt", contextTitles: [] },
      contextSnapshot: { blockCount: 3, totalChars: 2400, blocks: [] },
      attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z", durationMs: 60000, exitCode: 0 },
      adoptionDecision: "not-required",
      proposedPatchTargets: [],
      acceptedPatchTargets: [],
      commitResult: { historyAppended: true, invocationAppended: true },
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:01:00.000Z"
    };

    const wrapper = mount(TaskHistoryPanel, {
      props: { tasks: [task], invocations: [invocation] },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("起草正文");
    expect(wrapper.text()).toContain("pipeline.chapter.prose");
    expect(wrapper.text()).toContain("codex/gpt-5");
  });
});
