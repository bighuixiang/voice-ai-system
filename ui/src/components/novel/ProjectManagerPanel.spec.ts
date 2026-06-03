import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ProjectManagerPanel from "./ProjectManagerPanel.vue";
import type { NovelProject } from "@/types/novel";

vi.mock("element-plus", () => ({
  ElMessage: {
    warning: vi.fn()
  }
}));

const stubs = {
  "el-button": {
    props: ["loading"],
    emits: ["click"],
    template: `<button :data-loading="loading" @click="$emit('click')"><slot /></button>`
  },
  "el-form": { template: "<form @submit.prevent><slot /></form>" },
  "el-form-item": { template: "<label><slot /></label>" },
  "el-input": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-icon": { template: "<span><slot /></span>" },
  FolderOpened: true,
  Refresh: true,
  Upload: true
};

const project: NovelProject = {
  id: "demo",
  slug: "demo",
  title: "Demo Novel",
  genre: "fantasy",
  roughIdea: "A careful hero opens a sealed gate.",
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
  lastOpenedChapterId: "chapter-001",
  codex: { command: "codex" },
  chapters: [
    {
      id: "chapter-001",
      title: "Chapter 1",
      outlinePath: "outline/chapter-001.md",
      contentPath: "chapters/chapter-001.md",
      status: "drafted"
    }
  ]
};

describe("ProjectManagerPanel", () => {
  it("emits refresh and open events", async () => {
    const wrapper = mount(ProjectManagerPanel, {
      props: { projects: [project], currentProject: project, loading: false },
      global: { stubs }
    });

    await wrapper.find("button[aria-label='刷新项目']").trigger("click");
    await wrapper.find(".project-item").trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);
    expect(wrapper.emitted("open")?.[0]).toEqual([project]);
  });

  it("emits import input for a local directory", async () => {
    const wrapper = mount(ProjectManagerPanel, {
      props: { projects: [], currentProject: null, loading: false },
      global: { stubs }
    });
    const inputs = wrapper.findAll("input");

    await inputs[0].setValue("D:\\novels\\old-story");
    await inputs[1].setValue("Old Story");
    await inputs[2].setValue("fantasy");
    await wrapper.findAll("button").at(-1)?.trigger("click");

    expect(wrapper.emitted("import-project")?.[0]).toEqual([
      {
        sourcePath: "D:\\novels\\old-story",
        title: "Old Story",
        genre: "fantasy"
      }
    ]);
  });
});
