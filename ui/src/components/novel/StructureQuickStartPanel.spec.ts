import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StructureQuickStartPanel from "./StructureQuickStartPanel.vue";

const stubs = {
  "el-button": {
    props: ["disabled", "loading", "type"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-input": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<textarea :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-tooltip": { template: "<span><slot /></span>" },
  "el-icon": { template: "<span><slot /></span>" }
};

describe("StructureQuickStartPanel", () => {
  it("emits idea updates and can generate a structure from the rough idea", async () => {
    const wrapper = mount(StructureQuickStartPanel, {
      props: {
        idea: "主角发现旧符回应了他的血。",
        canReverseEngineer: true,
        canSaveStructure: true,
        isSaving: false
      },
      global: { stubs }
    });

    await wrapper.find("textarea").setValue("主角在雨夜发现旧符。");
    await wrapper.findAll("button")[2].trigger("click");

    expect(wrapper.emitted("update:idea")?.[0][0]).toBe("主角在雨夜发现旧符。");
    expect(wrapper.emitted("generate-from-idea")).toHaveLength(1);
  });

  it("disables reverse writing when there is no usable draft", () => {
    const wrapper = mount(StructureQuickStartPanel, {
      props: {
        idea: "",
        canReverseEngineer: false,
        canSaveStructure: false,
        isSaving: false
      },
      global: { stubs }
    });

    const buttons = wrapper.findAll("button");

    expect(buttons[0].attributes("disabled")).toBeDefined();
    expect(buttons[1].attributes("disabled")).toBeDefined();
    expect(buttons[2].attributes("disabled")).toBeDefined();
  });

  it("emits reverse and save actions", async () => {
    const wrapper = mount(StructureQuickStartPanel, {
      props: {
        idea: "主角追查异常印记。",
        canReverseEngineer: true,
        canSaveStructure: true,
        isSaving: false
      },
      global: { stubs }
    });

    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");
    await buttons[1].trigger("click");

    expect(wrapper.emitted("save-structure")).toHaveLength(1);
    expect(wrapper.emitted("reverse-from-draft")).toHaveLength(1);
  });
});
