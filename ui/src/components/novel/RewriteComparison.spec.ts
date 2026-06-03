import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RewriteComparison from "./RewriteComparison.vue";
import type { CodexTaskResult } from "@/types/novel";

const stubs = {
  "el-button": {
    emits: ["click"],
    template: `<button @click="$emit('click')"><slot /></button>`
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
      props: { result },
      global: { stubs }
    });
    const buttons = wrapper.findAll("button");

    await buttons[0].trigger("click");
    await buttons[1].trigger("click");
    await buttons[2].trigger("click");

    expect(wrapper.text()).toContain("May alter tone");
    expect(wrapper.text()).toContain("Keep the image?");
    expect(wrapper.emitted("reject")).toHaveLength(1);
    expect(wrapper.emitted("accept")).toHaveLength(1);
    expect(wrapper.emitted("apply-patches")).toHaveLength(1);
  });
});
