import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "./taskTemplates.js";

describe("taskTemplates", () => {
  it("builds stable prompts with output contract", () => {
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
});
