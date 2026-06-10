import { describe, expect, it } from "vitest";
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
      { id: "arc-1", type: "arc", label: "开局阶段", subtitle: "1-10" },
      { id: "char-hero", type: "character", label: "主角", subtitle: "练气前" },
      { id: "chapter-001", type: "chapter", label: "第1章", subtitle: "尸王破封" },
      { id: "ledger-risk", type: "ledger", label: "尸王封印", subtitle: "高风险" }
    ],
    edges: [
      { id: "edge-1", source: "arc-1", target: "chapter-001", type: "contains" },
      { id: "edge-2", source: "chapter-001", target: "char-hero", type: "involves" },
      { id: "edge-3", source: "ledger-risk", target: "chapter-001", type: "references", label: "risk" }
    ]
  };
}

describe("StoryGraphPanel", () => {
  it("renders grouped nodes and selected node relations", async () => {
    const wrapper = mount(StoryGraphPanel, {
      props: { graph: storyGraph() },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("4 个节点 / 3 条关系");
    expect(wrapper.text()).toContain("阶段");
    expect(wrapper.text()).toContain("开局阶段");
    expect(wrapper.text()).toContain("指向");
    expect(wrapper.text()).toContain("包含");
    expect(wrapper.text()).toContain("第1章");

    await wrapper.findAll("button").find((button) => button.text().includes("第1章"))?.trigger("click");

    expect(wrapper.text()).toContain("来自");
    expect(wrapper.text()).toContain("风险");
    expect(wrapper.text()).toContain("尸王封印");
    expect(wrapper.text()).toContain("涉及");
    expect(wrapper.text()).toContain("主角");
  });

  it("emits refresh from the toolbar", async () => {
    const wrapper = mount(StoryGraphPanel, {
      props: { graph: storyGraph() },
      global: { stubs }
    });

    await wrapper.find("button").trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });
});
