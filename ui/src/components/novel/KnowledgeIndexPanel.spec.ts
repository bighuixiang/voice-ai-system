import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import KnowledgeIndexPanel from "./KnowledgeIndexPanel.vue";
import type { KnowledgeIndexProjection, KnowledgeSearchResult } from "@/types/novel";

const stubs = {
  "el-button": {
    emits: ["click"],
    template: `<button class="rebuild-button" @click="$emit('click')"><slot /></button>`
  }
};

const index: KnowledgeIndexProjection = {
  projectSlug: "demo",
  facts: [
    {
      id: "fact:gate",
      text: "The gate opens.",
      chapterIds: ["chapter-001"],
      relatedEntities: ["Hero"],
      keywords: ["gate"],
      source: { type: "chapter-summary", id: "fact-1" },
      updatedAt: "2026-06-11T00:00:00.000Z"
    }
  ],
  triples: [
    {
      id: "triple:hero",
      subject: "Hero",
      predicate: "state_after",
      object: "Wounded.",
      chapterIds: ["chapter-001"],
      sourceFactIds: ["fact:gate"],
      updatedAt: "2026-06-11T00:00:00.000Z"
    }
  ],
  chapterIndex: {
    projectSlug: "demo",
    chapters: [
      {
        chapterId: "chapter-001",
        title: "Chapter 1",
        keywords: ["gate"],
        factIds: ["fact:gate"],
        tripleIds: ["triple:hero"],
        entityNames: ["Hero"],
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    ],
    keywords: { gate: ["chapter-001"] },
    updatedAt: "2026-06-11T00:00:00.000Z"
  },
  vectorSummary: {
    provider: "local",
    dimensions: 64,
    entryCount: 3,
    updatedAt: "2026-06-11T00:00:00.000Z"
  },
  updatedAt: "2026-06-11T00:00:00.000Z"
};

const searchResult: KnowledgeSearchResult = {
  query: "Hero gate",
  tokens: ["hero", "gate"],
  vectorSummary: index.vectorSummary,
  facts: [{ ...index.facts[0], score: 2, vectorScore: 0.64 }],
  triples: [{ ...index.triples[0], score: 1, vectorScore: 0.22 }],
  chapters: [{ ...index.chapterIndex.chapters[0], score: 3, vectorScore: 0.51 }]
};

describe("KnowledgeIndexPanel", () => {
  it("renders index stats and emits rebuild", async () => {
    const wrapper = mount(KnowledgeIndexPanel, {
      props: {
        isRebuilding: false,
        index
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("检索记忆层");
    expect(wrapper.text()).toContain("1 个事实 / 1 条关系");
    expect(wrapper.text()).toContain("Vector: local");
    expect(wrapper.text()).toContain("3 entries / 64 dims");
    expect(wrapper.text()).toContain("gate");
    expect(wrapper.text()).toContain("Chapter 1");

    await wrapper.find(".rebuild-button").trigger("click");

    expect(wrapper.emitted("rebuild")).toHaveLength(1);
  });

  it("emits search and renders matched facts, triples, and chapters", async () => {
    const wrapper = mount(KnowledgeIndexPanel, {
      props: {
        isRebuilding: false,
        isSearching: false,
        index,
        searchResult
      },
      global: { stubs }
    });

    await wrapper.find("input").setValue(" Hero gate ");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("search")).toEqual([["Hero gate"]]);
    expect(wrapper.text()).toContain("The gate opens.");
    expect(wrapper.text()).toContain("3 vectors");
    expect(wrapper.text()).toContain("向量 0.64");
    expect(wrapper.text()).toContain("Hero · state_after · Wounded.");
    expect(wrapper.text()).toContain("Chapter 1");
  });
});
