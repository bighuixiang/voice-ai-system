import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AutopilotRuntimePanel from "./AutopilotRuntimePanel.vue";
import type { RuntimeEvent, RuntimeRun } from "@/types/novel";

const activeRun: RuntimeRun = {
  id: "run-001",
  projectSlug: "demo",
  chapterId: "chapter-001",
  status: "running",
  command: "start",
  input: {},
  failureCount: 0,
  rewriteCount: 0,
  createdAt: "2026-06-19T00:00:00.000Z",
  updatedAt: "2026-06-19T00:00:00.000Z"
};

function mountPanel(props?: Partial<InstanceType<typeof AutopilotRuntimePanel>["$props"]>) {
  return mount(AutopilotRuntimePanel, {
    props: {
      events: [],
      checkpoints: [],
      branches: [],
      knowledgeRefs: [],
      eventConnected: false,
      starting: false,
      ...props
    },
    global: {
      stubs: {
        "el-button": {
          props: ["disabled", "loading", "type"],
          emits: ["click"],
          template: `<button :disabled="disabled || loading" @click="$emit('click')"><slot /></button>`
        },
        "el-input": {
          inheritAttrs: false,
          props: ["modelValue", "type"],
          emits: ["update:modelValue"],
          template: `<textarea v-if="type === 'textarea'" class="direction-input" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><input v-else class="text-input" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
        },
        "el-switch": {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: `<input class="auto-continue-switch" type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" />`
        },
        "el-select": {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: `<select class="derivative-type" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`
        },
        "el-option": {
          props: ["label", "value"],
          template: `<option :value="value">{{ label }}</option>`
        },
        "el-tag": {
          template: "<span><slot /></span>"
        },
        "el-icon": {
          template: "<span><slot /></span>"
        },
        CircleClose: true,
        Refresh: true,
        RefreshRight: true,
        VideoPause: true,
        VideoPlay: true
      }
    }
  });
}

describe("AutopilotRuntimePanel", () => {
  it("translates runtime event labels and messages into Chinese", () => {
    const events: RuntimeEvent[] = [
      {
        id: 1,
        eventId: "event-1",
        projectSlug: "demo",
        runId: "run-001",
        type: "stage",
        stage: "chapter_plan",
        message: "Planning chapter",
        payload: {},
        createdAt: "2026-06-26T00:00:00.000Z"
      },
      {
        id: 2,
        eventId: "event-2",
        projectSlug: "demo",
        runId: "run-001",
        type: "quality",
        stage: "quality_review",
        message: "Quality score 88",
        payload: {},
        createdAt: "2026-06-26T00:00:01.000Z"
      },
      {
        id: 3,
        eventId: "event-3",
        projectSlug: "demo",
        runId: "run-001",
        type: "checkpoint",
        stage: "checkpoint_before_run",
        message: "Checkpoint created: chapter-001",
        payload: {},
        createdAt: "2026-06-26T00:00:02.000Z"
      }
    ];
    const wrapper = mountPanel({ events });
    const text = wrapper.find(".event-list").text();

    expect(text).toContain("规划");
    expect(text).toContain("正在规划章节");
    expect(text).toContain("质检 · 质量");
    expect(text).toContain("质量评分：88");
    expect(text).toContain("快照 · 快照");
    expect(text).toContain("已创建快照：chapter-001");
  });

  it("shows the current chapter label for the active runtime", () => {
    const wrapper = mountPanel({
      activeRun,
      activeChapterLabel: "第1章 尸王破封"
    });

    expect(wrapper.find(".runtime-target").text()).toContain("第1章 尸王破封");
  });

  it("shows a clear worker offline warning when the run is queued", () => {
    const wrapper = mountPanel({
      activeRun: { ...activeRun, status: "queued" },
      worker: {
        status: "offline",
        lastHeartbeatAt: "2026-06-26T00:00:00.000Z",
        pollIntervalMs: 1500,
        staleAfterMs: 15000
      }
    });

    expect(wrapper.text()).toContain("执行引擎离线");
    expect(wrapper.find(".runtime-warning").text()).toContain("npm --prefix api run dev");
  });

  it("starts the runtime from the direction action when idle text is provided", async () => {
    const wrapper = mountPanel();

    await wrapper.find(".direction-input").setValue("重构第一章开头，直接切入冲突");

    const directionButtons = wrapper.findAll(".direction-actions button");

    expect(directionButtons[0]?.attributes("disabled")).toBeUndefined();

    await directionButtons[0]!.trigger("click");

    expect(wrapper.emitted("start")).toEqual([
      [{ direction: "重构第一章开头，直接切入冲突", autoContinue: false }]
    ]);
    expect(wrapper.emitted("direction")).toBeUndefined();
  });

  it("keeps sending direction updates to the active run when one exists", async () => {
    const wrapper = mountPanel({ activeRun });

    await wrapper.find(".direction-input").setValue("补强结尾压迫感");

    const directionButtons = wrapper.findAll(".direction-actions button");

    await directionButtons[0]!.trigger("click");
    await directionButtons[1]!.trigger("click");

    expect(wrapper.emitted("direction")).toEqual([["补强结尾压迫感"]]);
    expect(wrapper.emitted("rewrite")).toEqual([["补强结尾压迫感"]]);
    expect(wrapper.emitted("start")).toBeUndefined();
  });
});
