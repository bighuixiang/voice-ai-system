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
  createdAt: "2026-06-04T00:00:00.000Z",
  summaryPatch: {
    summary: "The chapter memory records the blood cost.",
    keyEvents: ["The gate answered blood."]
  },
  factPatches: [
    {
      id: "fact-1",
      chapterId: "chapter-001",
      fact: "The seal responds to blood.",
      relatedEntities: ["seal"],
      status: "pending",
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  characterStatePatches: [
    {
      id: "character-state-1",
      chapterId: "chapter-001",
      characterName: "Hero",
      after: "Wounded and wary.",
      cause: "Paid blood to test the gate.",
      relatedEntities: ["Hero"],
      status: "pending",
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  riskPatches: [
    {
      id: "risk-1",
      kind: "risk",
      title: "POV boundary",
      status: "watch",
      severity: "medium",
      chapterIds: ["chapter-001"],
      relatedEntities: ["Hero"],
      note: "Do not reveal hidden lore.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ]
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
    expect(wrapper.text()).toContain("The chapter memory records the blood cost.");
    expect(wrapper.text()).toContain("The seal responds to blood.");
    expect(wrapper.text()).toContain("Wounded and wary.");
    expect(wrapper.text()).toContain("POV boundary");
    expect(wrapper.text()).toContain("伏笔 1");

    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");
    await buttons[1].trigger("click");

    expect(wrapper.emitted("accept")).toHaveLength(1);
    expect(wrapper.emitted("reject")).toHaveLength(1);
  });

  it("shows a request action without a candidate", async () => {
    const wrapper = mount(WritingRecapPanel, {
      props: { candidate: null, canRequest: true },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("暂无写作回顾");
    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("request")).toHaveLength(1);
  });
});
