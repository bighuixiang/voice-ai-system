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

  it("treats cockpit data as writing boundaries for planning and drafting", () => {
    const prompt = buildTaskPrompt("chapter.draft", {
      contextBlocks: [
        { title: "章节仪表盘", content: "goal: Make the choice unavoidable." },
        { title: "场景卡", content: "Scene Cards: opening pressure" }
      ],
      payload: { chapterId: "chapter-001" }
    });

    expect(prompt).toContain("Chapter Dashboard");
    expect(prompt).toContain("Scene Cards");
    expect(prompt).toContain("structured ledgers");
    expect(prompt).toContain("Make the choice unavoidable.");
  });

  it("builds prewriting briefing and post-save recap instructions", () => {
    const briefingPrompt = buildTaskPrompt("writing.briefing", {
      contextBlocks: [],
      payload: { chapterId: "chapter-001" }
    });
    const recapPrompt = buildTaskPrompt("writing.recap", {
      contextBlocks: [],
      payload: { chapterId: "chapter-001" }
    });

    expect(briefingPrompt).toContain("previous chapter ending");
    expect(briefingPrompt).toContain("POV limits");
    expect(briefingPrompt).toContain("must remember");
    expect(briefingPrompt).toContain("must not reveal");
    expect(briefingPrompt).toContain("unresolved foreshadowing");
    expect(recapPrompt).toContain("WritingRecapCandidate");
    expect(recapPrompt).toContain("Do not auto-apply ledger updates");
  });

  it("requires reverse-structure tasks to return dashboard and scene cards", () => {
    const prompt = buildTaskPrompt("structure.reverse", {
      contextBlocks: [{ title: "目标正文", content: "正文内容" }],
      payload: { chapterId: "chapter-001", draftContent: "正文内容" }
    });

    expect(prompt).toContain("structure.reverse");
    expect(prompt).toContain("ChapterDashboard");
    expect(prompt).toContain("SceneCard");
    expect(prompt).toContain("dashboard");
    expect(prompt).toContain("scenes");
    expect(prompt).toContain("过滤标题、写作日期、版本号");
  });
});
