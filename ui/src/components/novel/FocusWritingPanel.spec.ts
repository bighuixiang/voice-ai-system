import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FocusWritingPanel from "./FocusWritingPanel.vue";
import type { FocusWritingGuide } from "@/types/novel";

const guide: FocusWritingGuide = {
  chapterId: "chapter-001",
  targetWords: 2000,
  currentWords: 800,
  progressPercent: 40,
  stageLabel: "进入场景",
  sceneTitle: "雨夜线索",
  nextBeat: "主角听见门后回应，却不能立刻退走。",
  guardrails: ["目标：发现线索", "视角：主角有限视角"],
  prompt: "下一笔提示",
  updatedAt: "2026-06-04T00:00:00.000Z"
};

function mountPanel() {
  return mount(FocusWritingPanel, {
    props: { guide },
    global: {
      stubs: {
        "el-icon": { template: "<span><slot /></span>" },
        Aim: true,
        DataAnalysis: true,
        Finished: true,
        MagicStick: true,
        "el-input-number": {
          inheritAttrs: false,
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: `<input class="target-input" :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))" />`
        },
        "el-button": {
          props: ["disabled", "loading"],
          emits: ["click"],
          template: `<button :disabled="disabled || loading" @click="$emit('click')"><slot /></button>`
        }
      }
    }
  });
}

describe("FocusWritingPanel", () => {
  it("renders progress, next beat, and guardrails", () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain("今日写作推进器");
    expect(wrapper.text()).toContain("800 / 2000 字");
    expect(wrapper.text()).toContain("主角听见门后回应");
    expect(wrapper.find(".progress-fill").attributes("style")).toContain("width: 40%");
  });

  it("emits target, generation, and mode actions", async () => {
    const wrapper = mountPanel();

    await wrapper.find(".target-input").setValue("2600");
    await wrapper.findAll("button")[0].trigger("click");
    await wrapper.findAll("button")[1].trigger("click");
    await wrapper.findAll("button")[2].trigger("click");

    expect(wrapper.emitted("update-target")?.[0]).toEqual([2600]);
    expect(wrapper.emitted("generate-draft")).toHaveLength(1);
    expect(wrapper.emitted("open-structure")).toHaveLength(1);
    expect(wrapper.emitted("open-review")).toHaveLength(1);
  });

  it("disables AI draft generation while unavailable", async () => {
    const wrapper = mount(FocusWritingPanel, {
      props: { guide, canGenerate: false },
      global: {
        stubs: {
          "el-icon": { template: "<span><slot /></span>" },
          Aim: true,
          DataAnalysis: true,
          Finished: true,
          MagicStick: true,
          "el-input-number": true,
          "el-button": {
            props: ["disabled", "loading"],
            emits: ["click"],
            template: `<button class="action-button" :disabled="disabled || loading" @click="$emit('click')"><slot /></button>`
          }
        }
      }
    });

    await wrapper.find(".action-button").trigger("click");

    expect(wrapper.emitted("generate-draft")).toBeUndefined();
  });
});
