import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChapterEditor from "./ChapterEditor.vue";

const chapter = {
  id: "chapter-001",
  number: 1,
  title: "第一章 山门",
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
      content: "旧正文",
      hasUnsavedChanges: false,
      saveStateLabel: "已保存",
      isSaving: false,
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

    await wrapper.find("textarea").setValue("新正文");

    expect(wrapper.emitted("update:content")?.[0]).toEqual(["新正文"]);
  });

  it("emits document switches without mutating the draft", async () => {
    const wrapper = mountEditor();

    await wrapper.findAll(".segment-option")[1].trigger("click");

    expect(wrapper.emitted("switch-document")?.[0]).toEqual(["outline"]);
    expect(wrapper.find("textarea").element.value).toBe("旧正文");
  });

  it("captures the selected region without changing content", async () => {
    const wrapper = mountEditor({
      content: "山风忽然停住，少年听见阵石低鸣。"
    });
    const textarea = wrapper.find("textarea").element as HTMLTextAreaElement;

    textarea.selectionStart = 2;
    textarea.selectionEnd = 7;
    await wrapper.find("textarea").trigger("select");

    expect(wrapper.emitted("selection")?.[0][0]).toMatchObject({
      filePath: chapter.contentPath,
      selectedText: "忽然停住，",
      start: 2,
      end: 7
    });
  });
});
