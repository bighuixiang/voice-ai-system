import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WritingRecapPanel from "./WritingRecapPanel.vue";
import type { WritingRecapCandidate } from "@/types/novel";

const candidate: WritingRecapCandidate = {
  chapterId: "chapter-001",
  summary: "A cost was paid for the clue.",
  newFacts: ["Blood can wake the mark."],
  characterStateChanges: ["The hero is more wary."],
  foreshadowingUpdates: [
    {
      id: "foreshadowing-1",
      kind: "foreshadowing",
      title: "Mark responds to blood",
      status: "watch",
      severity: "medium",
      chapterIds: ["chapter-001"],
      relatedEntities: ["Hero"],
      note: "Needs a later payoff.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  continuityRisks: [],
  powerProgressionUpdates: [],
  createdAt: "2026-06-04T00:00:00.000Z"
};

const stubs = {
  "el-button": {
    emits: ["click"],
    template: `<button @click="$emit('click')"><slot /></button>`
  },
  "el-tag": { template: "<span><slot /></span>" }
};

describe("WritingRecapPanel", () => {
  it("renders recap candidate details and emits decisions", async () => {
    const wrapper = mount(WritingRecapPanel, {
      props: { candidate },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("A cost was paid for the clue.");
    expect(wrapper.text()).toContain("Blood can wake the mark.");
    expect(wrapper.text()).toContain("The hero is more wary.");
    expect(wrapper.text()).toContain("伏笔 1");

    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");
    await buttons[1].trigger("click");

    expect(wrapper.emitted("accept")).toHaveLength(1);
    expect(wrapper.emitted("reject")).toHaveLength(1);
  });

  it("stays hidden without a candidate", () => {
    const wrapper = mount(WritingRecapPanel, {
      props: { candidate: null },
      global: { stubs }
    });

    expect(wrapper.html()).toBe("<!--v-if-->");
  });
});
