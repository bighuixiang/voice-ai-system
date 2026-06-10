import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import QuickReferencePanel from "./QuickReferencePanel.vue";
import type { KnowledgeIndexProjection, KnowledgeSearchResult, StoryControl } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled", "loading"],
    emits: ["click"],
    template: `<button class="deep-search-button" :disabled="disabled" @click="$emit('click')"><slot /></button>`
  }
};

const storyControl: StoryControl = {
  version: 1,
  premise: "A sealed city hides an old gate.",
  currentArcId: "arc-main",
  arcs: [],
  characters: [
    {
      id: "char-hero",
      name: "林澈",
      role: "主角",
      goal: "重启封门",
      currentState: "被尸气反噬",
      knownSecrets: "知道血月规则",
      relationshipNotes: "需要隐瞒真实来历",
      powerLevel: "炼气前",
      status: "active",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    {
      id: "char-rival",
      name: "许青鸾",
      role: "队友",
      goal: "追查天狗食月",
      currentState: "怀疑林澈",
      knownSecrets: "",
      relationshipNotes: "",
      powerLevel: "炼气一层",
      status: "planned",
      updatedAt: "2026-06-11T00:00:00.000Z"
    }
  ],
  events: [
    {
      id: "event-gate",
      type: "reveal",
      title: "封门复响",
      trigger: "月食开始",
      participants: ["林澈", "许青鸾"],
      location: "旧城天台",
      conflict: "尸王破封",
      reward: "获得血符",
      cost: "暴露气息",
      foreshadowing: "血符会反噬",
      chapterRange: "1-3",
      status: "active",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    {
      id: "event-hospital",
      type: "event",
      title: "医院暗线",
      trigger: "护士失踪",
      participants: ["陈医生"],
      location: "废弃医院",
      conflict: "病房出现尸斑",
      reward: "找到旧病历",
      cost: "惊动巡夜人",
      foreshadowing: "旧病历指向尸王封印",
      chapterRange: "5-6",
      status: "planned",
      updatedAt: "2026-06-11T00:00:00.000Z"
    }
  ],
  orchestrationNotes: "Keep costs visible.",
  updatedAt: "2026-06-11T00:00:00.000Z"
};

const knowledgeIndex: KnowledgeIndexProjection = {
  projectSlug: "demo",
  facts: [
    {
      id: "fact:blood-token",
      text: "血符只能在天狗食月时开启封门。",
      chapterIds: ["chapter-001"],
      relatedEntities: ["血符", "封门"],
      keywords: ["血符", "天狗食月"],
      source: { type: "chapter-summary", id: "fact-1" },
      updatedAt: "2026-06-11T00:00:00.000Z"
    }
  ],
  triples: [],
  chapterIndex: {
    projectSlug: "demo",
    chapters: [],
    keywords: {
      血符: ["chapter-001"],
      封门: ["chapter-001", "chapter-002"]
    },
    updatedAt: "2026-06-11T00:00:00.000Z"
  },
  updatedAt: "2026-06-11T00:00:00.000Z"
};

const searchResult: KnowledgeSearchResult = {
  query: "血符",
  tokens: ["血符"],
  facts: [{ ...knowledgeIndex.facts[0], score: 2 }],
  triples: [],
  chapters: [
    {
      chapterId: "chapter-001",
      title: "尸王破封",
      keywords: ["血符"],
      factIds: ["fact:blood-token"],
      tripleIds: [],
      entityNames: ["林澈"],
      updatedAt: "2026-06-11T00:00:00.000Z",
      score: 2
    }
  ]
};

describe("QuickReferencePanel", () => {
  it("summarizes story control and knowledge references", () => {
    const wrapper = mount(QuickReferencePanel, {
      props: {
        storyControl,
        knowledgeIndex,
        isSearching: false
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("快速参考");
    expect(wrapper.text()).toContain("林澈");
    expect(wrapper.text()).toContain("旧城天台");
    expect(wrapper.text()).toContain("血符");
    expect(wrapper.text()).toContain("血符只能在天狗食月时开启封门。");
  });

  it("filters local references and emits deep searches", async () => {
    const wrapper = mount(QuickReferencePanel, {
      props: {
        storyControl,
        knowledgeIndex,
        searchResult,
        isSearching: false
      },
      global: { stubs }
    });

    await wrapper.find("input").setValue("青鸾");

    expect(wrapper.text()).toContain("许青鸾");
    expect(wrapper.text()).toContain("旧城天台");
    expect(wrapper.text()).not.toContain("废弃医院");

    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("search")).toEqual([["青鸾"]]);
    expect(wrapper.text()).toContain("尸王破封");
  });
});
