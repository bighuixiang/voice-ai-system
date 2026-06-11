import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SavePipelinePanel from "./SavePipelinePanel.vue";
import type { SavePipelineStep } from "@/types/novel";

const stubs = {
  "el-button": {
    emits: ["click"],
    template: `<button class="run-button" @click="$emit('click')"><slot /></button>`
  },
  "el-switch": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<button class="auto-switch" @click="$emit('update:modelValue', !modelValue)">{{ modelValue ? "on" : "off" }}</button>`
  },
  "el-tooltip": {
    template: `<span><slot /></span>`
  }
};

const steps: SavePipelineStep[] = [
  { id: "save", label: "保存", status: "done", detail: "当前文档已保存" },
  { id: "recap", label: "章后回顾", status: "running", detail: "抽取事实变化" },
  { id: "quality", label: "质量重建", status: "pending" },
  { id: "knowledge", label: "知识索引", status: "skipped", detail: "前序步骤失败后跳过" },
  { id: "runtime", label: "运行快照", status: "error", detail: "runtime failed" }
];

describe("SavePipelinePanel", () => {
  it("renders pipeline steps and status details", () => {
    const wrapper = mount(SavePipelinePanel, {
      props: {
        autoRun: true,
        steps,
        isRunning: true
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("保存流水线");
    expect(wrapper.text()).toContain("正在编排 recap / quality / index");
    expect(wrapper.text()).toContain("当前文档已保存");
    expect(wrapper.text()).toContain("抽取事实变化");
    expect(wrapper.text()).toContain("前序步骤失败后跳过");
    expect(wrapper.text()).toContain("runtime failed");
    expect(wrapper.findAll(".step-item")).toHaveLength(5);
    expect(wrapper.find(".step-item.error").exists()).toBe(true);
    expect(wrapper.find(".step-item.skipped").exists()).toBe(true);
  });

  it("emits auto-run toggle and manual run events", async () => {
    const wrapper = mount(SavePipelinePanel, {
      props: {
        autoRun: false,
        steps: [],
        isRunning: false
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("手动运行，或开启自动保存后编排");
    expect(wrapper.findAll(".step-item")).toHaveLength(5);

    await wrapper.find(".auto-switch").trigger("click");
    await wrapper.find(".run-button").trigger("click");

    expect(wrapper.emitted("update:auto-run")?.[0]).toEqual([true]);
    expect(wrapper.emitted("run")).toHaveLength(1);
  });
});
