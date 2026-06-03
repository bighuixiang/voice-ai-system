import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { Notebook, Reading } from "@element-plus/icons-vue";
import WorkbenchSegmentedControl from "./WorkbenchSegmentedControl.vue";

const options = [
  { value: "content", label: "章节正文", description: "最终小说文本", icon: Reading, tone: "blue" as const },
  { value: "outline", label: "章纲设定", description: "目标、POV、伏笔", icon: Notebook, tone: "emerald" as const }
];

describe("WorkbenchSegmentedControl", () => {
  it("marks the current value and emits changes", async () => {
    const wrapper = mount(WorkbenchSegmentedControl, {
      props: {
        modelValue: "content",
        options,
        ariaLabel: "章节编辑类型"
      },
      global: {
        stubs: ["el-icon"]
      }
    });

    expect(wrapper.findAll(".segment-option")[0].classes()).toContain("active");

    await wrapper.findAll(".segment-option")[1].trigger("click");

    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["outline"]);
  });
});
