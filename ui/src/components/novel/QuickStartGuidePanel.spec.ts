import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import QuickStartGuidePanel from "./QuickStartGuidePanel.vue";

const stubs = {
  "el-button": {
    emits: ["click"],
    template: `<button type="button" @click="$emit('click')"><slot /></button>`
  },
  "el-icon": { template: "<span><slot /></span>" },
  DataAnalysis: true,
  Edit: true,
  EditPen: true,
  Finished: true,
  Plus: true,
  Position: true
};

describe("QuickStartGuidePanel", () => {
  it("shows the beginner creation path and emits hub actions", async () => {
    const wrapper = mount(QuickStartGuidePanel, {
      props: { variant: "hub" },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("第一次用？按这条路线走");
    expect(wrapper.text()).toContain("写一句粗略想法");
    expect(wrapper.text()).toContain("审稿、润色、保存");

    await wrapper.findAll("button")[0].trigger("click");
    await wrapper.findAll("button")[1].trigger("click");

    expect(wrapper.emitted("start-create")).toHaveLength(1);
    expect(wrapper.emitted("use-example")).toHaveLength(1);
  });

  it("marks workspace progress and emits writing mode changes", async () => {
    const wrapper = mount(QuickStartGuidePanel, {
      props: {
        variant: "workspace",
        mode: "focus",
        hasStructure: true,
        hasDraft: false
      },
      global: { stubs }
    });

    expect(wrapper.findAll(".step-item")[0].classes()).toContain("done");
    expect(wrapper.findAll(".step-item")[1].classes()).toContain("active");

    await wrapper.findAll("button")[2].trigger("click");

    expect(wrapper.emitted("open-mode")?.[0]).toEqual(["review"]);
  });
});
