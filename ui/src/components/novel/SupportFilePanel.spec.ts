import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SupportFilePanel from "./SupportFilePanel.vue";

const stubs = {
  "el-button": {
    props: ["disabled"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-icon": { template: "<span><slot /></span>" },
  "el-radio-group": {
    name: "ElRadioGroup",
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<div data-test="radio-group"><slot /></div>`
  },
  "el-radio-button": {
    props: ["label"],
    template: `<button type="button"><slot /></button>`
  },
  DocumentChecked: true
};

describe("SupportFilePanel", () => {
  it("emits edited support markdown and save events", async () => {
    const wrapper = mount(SupportFilePanel, {
      props: {
        files: [{ label: "World", path: "bible/world.md" }],
        currentPath: "bible/world.md",
        content: "old notes",
        hasUnsavedChanges: true
      },
      global: { stubs }
    });

    await wrapper.find("textarea").setValue("new notes");
    await wrapper.find("button").trigger("click");

    expect(wrapper.emitted("update:content")?.[0]).toEqual(["new notes"]);
    expect(wrapper.emitted("save")).toHaveLength(1);
  });

  it("emits the selected support file path", async () => {
    const wrapper = mount(SupportFilePanel, {
      props: {
        files: [
          { label: "Characters", path: "bible/characters.md" },
          { label: "World", path: "bible/world.md" }
        ],
        currentPath: "bible/characters.md",
        content: "",
        hasUnsavedChanges: false
      },
      global: { stubs }
    });

    await wrapper.findComponent({ name: "el-radio-group" }).vm.$emit("update:modelValue", "bible/world.md");

    expect(wrapper.emitted("open")?.[0]).toEqual(["bible/world.md"]);
  });
});
