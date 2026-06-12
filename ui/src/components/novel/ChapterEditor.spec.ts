import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChapterEditor from "./ChapterEditor.vue";

const chapter = {
  id: "chapter-001",
  title: "Chapter 1",
  outlinePath: "outline/chapter-001.md",
  contentPath: "chapters/chapter-001.md",
  status: "drafted" as const
};

function mountEditor(overrides = {}) {
  return mount(ChapterEditor, {
    props: {
      chapter,
      documentKind: "content",
      documentLabel: "章节正文",
      filePath: chapter.contentPath,
      content: "old draft",
      hasUnsavedChanges: false,
      saveStateLabel: "已保存",
      isSaving: false,
      wordCount: 12,
      ...overrides
    },
    global: {
      stubs: ["el-button", "el-icon", "DocumentChecked"]
    }
  });
}

describe("ChapterEditor", () => {
  it("emits edited markdown content", async () => {
    const wrapper = mountEditor();

    await wrapper.find("textarea").setValue("new draft");

    expect(wrapper.emitted("update:content")?.[0]).toEqual(["new draft"]);
  });

  it("emits document switches without mutating the draft", async () => {
    const wrapper = mountEditor();

    await wrapper.findAll(".segment-option")[1].trigger("click");

    expect(wrapper.emitted("switch-document")?.[0]).toEqual(["outline"]);
    expect(wrapper.find("textarea").element.value).toBe("old draft");
  });

  it("keeps save state, word count, and soft wrapping visible", () => {
    const wrapper = mountEditor({ wordCount: 18 });

    expect(wrapper.text()).toContain("18 字");
    expect(wrapper.find(".save-button").exists()).toBe(true);
    expect(wrapper.find("textarea").attributes("wrap")).toBe("soft");
  });

  it("emits save from the editor shortcut in fallback mode", async () => {
    const wrapper = mountEditor();

    await wrapper.find("textarea").trigger("keydown", { key: "s", ctrlKey: true });

    expect(wrapper.emitted("save")).toHaveLength(1);
  });

  it("captures the selected region without changing content", async () => {
    const wrapper = mountEditor({
      content: "mountain wind stopped suddenly"
    });
    const textarea = wrapper.find("textarea").element as HTMLTextAreaElement;

    textarea.selectionStart = 9;
    textarea.selectionEnd = 13;
    await wrapper.find("textarea").trigger("select");

    expect(wrapper.emitted("selection")?.[0][0]).toMatchObject({
      filePath: chapter.contentPath,
      selectedText: "wind",
      start: 9,
      end: 13
    });
  });
});
