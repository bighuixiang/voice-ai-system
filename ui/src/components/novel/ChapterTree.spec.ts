import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChapterTree from "./ChapterTree.vue";
import type { NovelChapter, NovelProject } from "@/types/novel";

function chapter(index: number, patch: Partial<NovelChapter> = {}): NovelChapter {
  return {
    id: `chapter-${String(index).padStart(3, "0")}`,
    title: `第 ${index} 章`,
    outlinePath: `outline/chapter-${String(index).padStart(3, "0")}.md`,
    contentPath: `chapters/chapter-${String(index).padStart(3, "0")}.md`,
    status: "empty",
    order: index,
    ...patch
  };
}

function project(chapters: NovelChapter[]): NovelProject {
  return {
    id: "novel-demo",
    slug: "novel-demo",
    title: "Demo Novel",
    genre: "fantasy",
    roughIdea: "",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    lastOpenedChapterId: chapters[0]?.id || "",
    codex: { command: "codex" },
    chapters
  };
}

const stubs = {
  "el-tag": { template: "<span class='tag'><slot /></span>" },
  "el-icon": { template: "<span><slot /></span>" },
  "el-tooltip": { template: "<span><slot /></span>" },
  "el-input": {
    inheritAttrs: false,
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<input class="search-input" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-button": {
    props: ["disabled"],
    emits: ["click"],
    template: `<button type="button" :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  Aim: true,
  Collection: true,
  Search: true,
  SortDown: true,
  SortUp: true
};

function mountTree(input: { chapters: NovelChapter[]; activeChapterId?: string }) {
  return mount(ChapterTree, {
    props: {
      project: project(input.chapters),
      activeChapterId: input.activeChapterId
    },
    global: { stubs }
  });
}

describe("ChapterTree", () => {
  it("defaults to descending grouped virtual rows for very long chapter lists", () => {
    const chapters = Array.from({ length: 1000 }, (_, index) => chapter(index + 1));
    const wrapper = mountTree({ chapters, activeChapterId: "chapter-1000" });

    expect(wrapper.text()).toContain("按百章");
    expect(wrapper.text()).toContain("第 901-1000 章");
    expect(wrapper.text()).toContain("第 1000 章");
    expect(wrapper.findAll(".chapter-item").length).toBeLessThan(40);
  });

  it("searches chapters without rendering every row", async () => {
    const chapters = Array.from({ length: 150 }, (_, index) => chapter(index + 1));
    const wrapper = mountTree({ chapters });

    await wrapper.find("input.search-input").setValue("第 12 章");

    expect(wrapper.text()).toContain("1 个结果");
    expect(wrapper.text()).toContain("第 12 章");
    expect(wrapper.text()).not.toContain("第 101-200 章");
  });

  it("uses volume metadata when chapters are already divided into volumes", () => {
    const chapters = [
      chapter(1, { volumeId: "v1", volumeTitle: "第一卷 山门雨夜", volumeOrder: 1 }),
      chapter(2, { volumeId: "v1", volumeTitle: "第一卷 山门雨夜", volumeOrder: 1 }),
      chapter(101, { volumeId: "v2", volumeTitle: "第二卷 城市旧印", volumeOrder: 2 })
    ];
    const wrapper = mountTree({ chapters, activeChapterId: "chapter-101" });
    const text = wrapper.text();

    expect(text).toContain("按分卷");
    expect(text.indexOf("第二卷 城市旧印")).toBeLessThan(text.indexOf("第一卷 山门雨夜"));
  });

  it("emits the selected chapter", async () => {
    const chapters = [chapter(1), chapter(2), chapter(3)];
    const wrapper = mountTree({ chapters });

    await wrapper.find(".chapter-item").trigger("click");

    expect(wrapper.emitted("open")?.[0][0]).toMatchObject({ id: "chapter-003" });
  });
});
