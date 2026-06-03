import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "./taskTemplates.js";

describe("taskTemplates", () => {
  it("builds stable Chinese prompts with output contract", () => {
    const prompt = buildTaskPrompt("selection.polish", {
      projectTitle: "测试小说",
      target: "chapter-001",
      contextBlocks: [{ title: "选区", content: "原文" }],
      payload: { mode: "polish" }
    });

    expect(prompt).toContain("selection.polish");
    expect(prompt).toContain("POV");
    expect(prompt).toContain("patches");
    expect(prompt).toContain("只输出 JSON");
  });

  it("tells chapter planning and drafting to use separate files", () => {
    const prompt = buildTaskPrompt("chapter.plan", {
      contextBlocks: [],
      payload: { filePath: "outline/chapter-001.md" }
    });

    expect(prompt).toContain("chapter.plan 优先产出章纲设定");
    expect(prompt).toContain("outline/chapter-xxx.md");
    expect(prompt).toContain("chapters/chapter-xxx.md");
  });
});
