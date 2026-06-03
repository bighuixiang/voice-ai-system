import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SelectionToolbar from "./SelectionToolbar.vue";

const stubs = {
  "el-button": {
    props: ["disabled"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-icon": { template: "<span><slot /></span>" },
  EditPen: true,
  Fold: true,
  MagicStick: true,
  Reading: true,
  TrendCharts: true,
  Warning: true
};

describe("SelectionToolbar", () => {
  it("disables polish modes when no text is selected", () => {
    const wrapper = mount(SelectionToolbar, {
      props: { selection: null, loading: false },
      global: { stubs }
    });

    expect(wrapper.findAll("button").every((button) => button.attributes("disabled") !== undefined)).toBe(true);
  });

  it("emits the requested polish mode for an active selection", async () => {
    const wrapper = mount(SelectionToolbar, {
      props: {
        loading: false,
        selection: {
          filePath: "chapters/chapter-001.md",
          selectedText: "plain line",
          beforeText: "",
          afterText: "",
          start: 0,
          end: 10
        }
      },
      global: { stubs }
    });

    await wrapper.findAll("button")[0].trigger("click");

    expect(wrapper.emitted("polish")?.[0]).toEqual(["polish"]);
    expect(wrapper.text()).toContain("10");
  });
});
