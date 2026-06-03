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

describe("ChapterEditor", () => {
  it("emits edited markdown content", async () => {
    const wrapper = mount(ChapterEditor, {
      props: {
        chapter,
        filePath: chapter.contentPath,
        content: "旧正文",
        hasUnsavedChanges: false
      },
      global: {
        stubs: ["el-button", "el-icon", "el-tag", "DocumentChecked"]
      }
    });

    await wrapper.find("textarea").setValue("新正文");

    expect(wrapper.emitted("update:content")?.[0]).toEqual(["新正文"]);
  });

  it("captures the selected region without changing content", async () => {
    const wrapper = mount(ChapterEditor, {
      props: {
        chapter,
        filePath: chapter.contentPath,
        content: "山风忽然停住，少年听见阵石低鸣。",
        hasUnsavedChanges: false
      },
      global: {
        stubs: ["el-button", "el-icon", "el-tag", "DocumentChecked"]
      }
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
