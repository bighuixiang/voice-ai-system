import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ReviewQualityPanel from "./ReviewQualityPanel.vue";
import type { ChapterQualityReport } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled", "type"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-select": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`
  },
  "el-option": { props: ["label", "value"], template: `<option :value="value">{{ label }}</option>` },
  "el-icon": { template: "<span><slot /></span>" }
};

const report: ChapterQualityReport = {
  chapterId: "chapter-001",
  overallScore: 78,
  summary: "这一章的基础驱动力已经成立。",
  metrics: [
    { key: "rhythm", label: "节奏", score: 80, note: "推进感较稳。" },
    { key: "conflict", label: "冲突", score: 76, note: "阻力已经进入文本。" },
    { key: "emotion", label: "情绪", score: 72, note: "情绪能支撑场面。" },
    { key: "information", label: "信息", score: 70, note: "有信息释放。" },
    { key: "prose", label: "文笔", score: 82, note: "有具体画面。" },
    { key: "hook", label: "钩子", score: 68, note: "结尾还可更锋利。" }
  ],
  strengths: ["文笔：有具体画面。"],
  fixes: ["钩子：结尾还可更锋利。"],
  updatedAt: "2026-06-04T00:00:00.000Z"
};

describe("ReviewQualityPanel", () => {
  it("renders a quality report and emits diagnose", async () => {
    const wrapper = mount(ReviewQualityPanel, {
      props: {
        report,
        selectedTone: "elegant",
        canDiagnose: true,
        canTuneSelection: false
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("78");
    expect(wrapper.text()).toContain("钩子：结尾还可更锋利。");

    await wrapper.findAll("button")[0].trigger("click");
    expect(wrapper.emitted("diagnose")).toHaveLength(1);
  });

  it("updates tone and emits tune action for selected text", async () => {
    const wrapper = mount(ReviewQualityPanel, {
      props: {
        report: null,
        selectedTone: "elegant",
        canDiagnose: false,
        canTuneSelection: true
      },
      global: { stubs }
    });

    await wrapper.find("select").setValue("tense");
    await wrapper.findAll("button")[1].trigger("click");

    expect(wrapper.emitted("update:tone")?.[0][0]).toBe("tense");
    expect(wrapper.emitted("tune-selection")).toHaveLength(1);
  });

  it("disables actions when there is no draft or selected text", () => {
    const wrapper = mount(ReviewQualityPanel, {
      props: {
        report: null,
        selectedTone: "elegant",
        canDiagnose: false,
        canTuneSelection: false
      },
      global: { stubs }
    });

    const buttons = wrapper.findAll("button");
    expect(buttons[0].attributes("disabled")).toBeDefined();
    expect(buttons[1].attributes("disabled")).toBeDefined();
  });
});
