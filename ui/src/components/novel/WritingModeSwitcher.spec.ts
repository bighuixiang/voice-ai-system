import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WritingModeSwitcher from "./WritingModeSwitcher.vue";

const stubs = {
  "el-icon": { template: "<span><slot /></span>" },
  DataAnalysis: true,
  Edit: true,
  Finished: true
};

describe("WritingModeSwitcher", () => {
  it("renders focus, structure, and review modes", () => {
    const wrapper = mount(WritingModeSwitcher, {
      props: { mode: "structure" },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("专注");
    expect(wrapper.text()).toContain("结构");
    expect(wrapper.text()).toContain("审稿");
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
  });

  it("emits mode changes from the segmented control", async () => {
    const wrapper = mount(WritingModeSwitcher, {
      props: { mode: "structure" },
      global: { stubs }
    });

    await wrapper.findAll(".segment-option")[0].trigger("click");
    await wrapper.findAll(".segment-option")[2].trigger("click");

    expect(wrapper.emitted("update:mode")?.[0]).toEqual(["focus"]);
    expect(wrapper.emitted("update:mode")?.[1]).toEqual(["review"]);
  });
});
