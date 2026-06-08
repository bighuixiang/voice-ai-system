import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ProjectManagerPanel from "./ProjectManagerPanel.vue";
import type { NovelProject } from "@/types/novel";

vi.mock("element-plus", () => ({
  ElMessage: {
    warning: vi.fn()
  }
}));

const stubs = {
  "el-button": {
    props: ["loading", "nativeType"],
    emits: ["click"],
    template: `<button :type="nativeType || 'button'" :data-loading="loading" @click="$emit('click')"><slot /></button>`
  },
  "el-form": { template: "<form @submit.prevent><slot /></form>" },
  "el-form-item": { template: "<label><slot /></label>" },
  "el-input": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-select": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `
      <select
        multiple
        :value="modelValue"
        @change="$emit('update:modelValue', Array.from($event.target.selectedOptions).map((option) => option.value))"
      >
        <slot />
      </select>
    `
  },
  "el-option": {
    props: ["label", "value"],
    template: `<option :value="value">{{ label }}</option>`
  },
  "el-icon": { template: "<span><slot /></span>" },
  CopyDocument: true,
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
    await wrapper.find(".project-open").trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);
    expect(wrapper.emitted("open")?.[0]).toEqual([project]);
  });

  it("emits import input for a local directory", async () => {
    const wrapper = mount(ProjectManagerPanel, {
      props: { projects: [], currentProject: null, loading: false },
      global: { stubs }
    });
    const inputs = wrapper.findAll("input:not([type='file'])");

    await inputs[0].setValue("D:\\novels\\old-story");
    await inputs[1].setValue("Old Story");
    await wrapper.find("select").setValue(["玄幻", "悬疑"]);
    await wrapper.findAll("button").at(-1)?.trigger("click");

    expect(wrapper.emitted("import-project")?.[0]).toEqual([
      {
        sourcePath: "D:\\novels\\old-story",
        title: "Old Story",
        genre: "玄幻 / 悬疑"
      }
    ]);
  });

  it("pastes a local directory path from the clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn().mockResolvedValue('"D:\\novels\\clip-story"')
      }
    });
    const wrapper = mount(ProjectManagerPanel, {
      props: { projects: [], currentProject: null, loading: false },
      global: { stubs }
    });

    await wrapper.find(".path-actions button:nth-child(2)").trigger("click");
    await flushPromises();
    const inputs = wrapper.findAll("input:not([type='file'])");

    expect((inputs[0].element as HTMLInputElement).value).toBe("D:\\novels\\clip-story");
    expect((inputs[1].element as HTMLInputElement).value).toBe("clip-story");
  });

  it("writes the selected browser directory back to the path field and emits uploaded files", async () => {
    const wrapper = mount(ProjectManagerPanel, {
      props: { projects: [], currentProject: null, loading: false },
      global: { stubs }
    });
    const file = new File(["# Uploaded Chapter\n\nBody."], "chapter-001.md", { type: "text/markdown" }) as File & {
      webkitRelativePath?: string;
    };
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: "upload-story/03-chapters/chapter-001.md"
    });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: vi.fn().mockResolvedValue("# Uploaded Chapter\n\nBody.")
    });
    const input = wrapper.find("input[type='file']");
    Object.defineProperty(input.element, "files", {
      configurable: true,
      value: [file]
    });

    await input.trigger("change");
    await flushPromises();
    const inputs = wrapper.findAll("input:not([type='file'])");

    expect((inputs[0].element as HTMLInputElement).value).toBe("已选择目录：upload-story（1 个文件）");
    expect((inputs[1].element as HTMLInputElement).value).toBe("upload-story");

    await wrapper.findAll("button").at(-1)?.trigger("click");

    expect(wrapper.emitted("import-project")?.[0]).toEqual([
      {
        sourcePath: "upload-story",
        title: "upload-story",
        genre: undefined,
        files: [{ relativePath: "upload-story/03-chapters/chapter-001.md", content: "# Uploaded Chapter\n\nBody." }]
      }
    ]);
  });
});
