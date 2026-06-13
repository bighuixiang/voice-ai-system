import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import StoryGraphPanel from "./StoryGraphPanel.vue";
import type { StoryGraphProjection } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`
  }
};

function storyGraph(): StoryGraphProjection {
  return {
    projectSlug: "demo",
    updatedAt: "2026-06-11T00:00:00.000Z",
    nodes: [
      { id: "arc-1", type: "arc", label: "Opening arc", subtitle: "1-10" },
      { id: "char-hero", type: "character", label: "Hero", subtitle: "Qi novice" },
      { id: "char-mentor", type: "character", label: "Mentor", subtitle: "Guide" },
      { id: "chapter-001", type: "chapter", label: "Chapter 1", subtitle: "Seal breaks" },
      { id: "ledger-risk", type: "ledger", label: "Sealed king risk", subtitle: "high" },
      { id: "knowledge-gate", type: "knowledge", label: "Moon omen", subtitle: "subject" },
      { id: "knowledge-seal", type: "knowledge", label: "Sealed king", subtitle: "object" }
    ],
    edges: [
      { id: "edge-1", source: "arc-1", target: "chapter-001", type: "contains" },
      { id: "edge-2", source: "chapter-001", target: "char-hero", type: "involves" },
      { id: "edge-3", source: "ledger-risk", target: "chapter-001", type: "references", label: "risk" },
      { id: "edge-4", source: "knowledge-gate", target: "knowledge-seal", type: "asserts", label: "breaks" },
      { id: "edge-5", source: "char-hero", target: "char-mentor", type: "relationship", label: "trusts" }
    ],
    characterRelations: {
      characters: [
        { id: "char-hero", type: "character", label: "Hero", subtitle: "POV" },
        { id: "char-mentor", type: "character", label: "Mentor", subtitle: "Guide" },
        { id: "char-shadow", type: "character", label: "Shadow", subtitle: "Unknown" }
      ],
      relationships: [
        {
          id: "rel-hero-mentor",
          sourceCharacterId: "char-hero",
          targetCharacterId: "char-mentor",
          sourceName: "Hero",
          targetName: "Mentor",
          label: "trusts",
          weight: 2,
          sourceTypes: ["knowledge", "event"],
          chapterIds: ["chapter-001"],
          evidence: [
            {
              sourceType: "knowledge",
              sourceId: "triple-hero-mentor",
              label: "trusts",
              chapterIds: ["chapter-001"],
              note: "Hero trusts Mentor"
            },
            {
              sourceType: "event",
              sourceId: "gate-opens",
              label: "Gate opens",
              chapterIds: ["chapter-001"],
              note: "They stand near the gate."
            }
          ]
        }
      ],
      coverage: [
        {
          characterId: "char-hero",
          name: "Hero",
          relationshipCount: 1,
          eventCount: 1,
          knowledgeTripleCount: 1,
          hasProfileNote: true,
          isolated: false
        },
        {
          characterId: "char-mentor",
          name: "Mentor",
          relationshipCount: 1,
          eventCount: 1,
          knowledgeTripleCount: 1,
          hasProfileNote: false,
          isolated: false
        },
        {
          characterId: "char-shadow",
          name: "Shadow",
          relationshipCount: 0,
          eventCount: 0,
          knowledgeTripleCount: 0,
          hasProfileNote: false,
          isolated: true
        }
      ],
      appearanceSignals: [
        {
          characterId: "char-shadow",
          name: "Shadow",
          status: "should-appear",
          priority: 1,
          appearanceCount: 0,
          mentionedInUpcoming: false,
          relationshipCount: 0,
          reasons: ["主线角色优先", "关系图缺少证据"]
        },
        {
          characterId: "char-hero",
          name: "Hero",
          status: "balanced",
          priority: 0,
          appearanceCount: 1,
          lastChapterId: "chapter-001",
          lastChapterNumber: 1,
          gapChapters: 0,
          mentionedInUpcoming: true,
          relationshipCount: 1,
          reasons: ["节奏正常"]
        }
      ]
    }
  };
}

describe("StoryGraphPanel", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders grouped nodes, selected node relations, and character relation evidence", async () => {
    const wrapper = mount(StoryGraphPanel, {
      props: { graph: storyGraph() },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("7 个节点 / 5 条关系");
    expect(wrapper.text()).toContain("阶段");
    expect(wrapper.text()).toContain("知识");
    expect(wrapper.text()).toContain("Opening arc");
    expect(wrapper.find("[aria-label='知识图谱网络']").exists()).toBe(true);
    expect(wrapper.text()).toContain("指向");
    expect(wrapper.text()).toContain("包含");
    expect(wrapper.text()).toContain("Chapter 1");

    await wrapper.findAll("button").find((button) => button.text().includes("Chapter 1"))?.trigger("click");

    expect(wrapper.text()).toContain("来自");
    expect(wrapper.text()).toContain("风险");
    expect(wrapper.text()).toContain("Sealed king risk");
    expect(wrapper.text()).toContain("涉及");
    expect(wrapper.text()).toContain("Hero");

    await wrapper.findAll(".canvas-node").find((node) => node.text().includes("Moon omen"))?.trigger("click");

    expect(wrapper.text()).toContain("breaks");
    expect(wrapper.find("[aria-label='角色关系网络']").exists()).toBe(true);
    expect(wrapper.text()).toContain("角色关系图");
    expect(wrapper.text()).toContain("Mentor");
    expect(wrapper.text()).toContain("trusts");
    expect(wrapper.text()).toContain("Shadow");
    expect(wrapper.find("[aria-label='角色登场调度']").exists()).toBe(true);
    expect(wrapper.text()).toContain("建议登场");
    expect(wrapper.text()).toContain("主线角色优先");
    expect(wrapper.text()).toContain("缺少关系证据");
  });

  it("emits refresh from the toolbar", async () => {
    const wrapper = mount(StoryGraphPanel, {
      props: { graph: storyGraph() },
      global: { stubs }
    });

    await wrapper.find("button").trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });

  it("focuses a character scheduling signal from parent navigation", async () => {
    const wrapper = mount(StoryGraphPanel, {
      props: {
        graph: storyGraph(),
        focus: { characterId: "char-shadow", nodeId: "char-shadow", appearanceStatus: "should-appear" }
      },
      global: { stubs }
    });

    await wrapper.vm.$nextTick();

    const activeSchedule = wrapper.find(".schedule-row.active");
    expect(activeSchedule.exists()).toBe(true);
    expect(activeSchedule.text()).toContain("Shadow");
    expect(wrapper.findAll(".relation-node.active").some((node) => node.text().includes("Shadow"))).toBe(true);
  });
});
