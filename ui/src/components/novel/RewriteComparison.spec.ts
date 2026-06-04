import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RewriteComparison from "./RewriteComparison.vue";
import type { CodexTaskResult } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-tag": { template: "<span><slot /></span>" }
};

const result: CodexTaskResult = {
  summary: "Polished",
  content: "A calmer, more causal rewrite.",
  changes: ["Reduced exaggeration"],
  risks: ["May alter tone"],
  questions: ["Keep the image?"],
  patches: [{ target: "chapters/chapter-001.md", mode: "replace-file", content: "accepted" }]
};

describe("RewriteComparison", () => {
  it("renders nothing when there is no AI result", () => {
    const wrapper = mount(RewriteComparison, {
      props: { result: null },
      global: { stubs }
    });

    expect(wrapper.html()).toBe("<!--v-if-->");
  });

  it("shows risks and emits accept, reject, and patch events", async () => {
    const wrapper = mount(RewriteComparison, {
      props: { result, originalText: "Original selected line." },
      global: { stubs }
    });
    const buttons = wrapper.findAll("button");

    await buttons[0].trigger("click");
    await buttons[1].trigger("click");
    await buttons[2].trigger("click");

    expect(wrapper.text()).toContain("原文");
    expect(wrapper.text()).toContain("建议稿");
    expect(wrapper.text()).toContain("Original selected line.");
    expect(wrapper.text()).toContain("May alter tone");
    expect(wrapper.text()).toContain("Keep the image?");
    expect(wrapper.emitted("reject")).toHaveLength(1);
    expect(wrapper.emitted("accept")).toHaveLength(1);
    expect(wrapper.emitted("apply-patches")).toHaveLength(1);
  });

  it("disables selected rewrite acceptance when there is no active selection", () => {
    const wrapper = mount(RewriteComparison, {
      props: { result, originalText: "" },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("当前没有选区");
    expect(wrapper.findAll("button")[1].attributes("disabled")).toBeDefined();
  });
});
