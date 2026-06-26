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
    expect(prompt).toContain("craftBeats");
    expect(prompt).toContain("narrativeFunction");
    expect(prompt).toContain("readerPayoff");
    expect(prompt).toContain("do not copy or closely imitate");
    expect(prompt).toContain("original epic atmosphere");
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
    expect(prompt).toContain("planned CraftBeats");
    expect(prompt).toContain("Daily-life");
    expect(prompt).toContain("cosmic scale must enter through immediate danger");
    expect(prompt).toContain("first screen");
    expect(prompt).toContain("environmental feedback");
    expect(prompt).toContain("summary-style emotion lines");
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
    expect(recapPrompt).toContain("summaryPatch");
    expect(recapPrompt).toContain("factPatches");
    expect(recapPrompt).toContain("ledgerPatches");
    expect(recapPrompt).toContain("characterStatePatches");
    expect(recapPrompt).toContain("riskPatches");
    expect(recapPrompt).toContain("craftBeatPatches");
    expect(recapPrompt).toContain("author approval before merge");
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
    const qualityRewritePrompt = buildTaskPrompt("quality.rewrite", {
      contextBlocks: [{ title: "Quality Rewrite Targets", content: JSON.stringify({ targetScore: 86, maxScore: 100 }) }],
      payload: {
        chapterId: "chapter-001",
        filePath: "chapters/chapter-001.md",
        targetScore: 86,
        maxScore: 100,
        targetMetrics: [{ key: "hook", label: "Hook", score: 68, note: "Flat ending." }]
      }
    });
    expect(qualityRewritePrompt).toContain("Quality Rewrite Contract");
    expect(qualityRewritePrompt).toContain("pass line to exceed");
    expect(qualityRewritePrompt).toContain("score ceiling");
    expect(qualityRewritePrompt).toContain("Repair toward original genre-level craft only");
    expect(qualityRewritePrompt).toContain("replace empty grandeur with concrete pressure");
    expect(qualityRewritePrompt).toContain("inert paragraphs");
    expect(qualityRewritePrompt).toContain("fake-suspense ending lines");
    expect(prompt).toContain("过滤标题、写作日期、版本号");
  });
  it("builds structured quality review instructions for runtime critique", () => {
    const prompt = buildTaskPrompt("quality.review", {
      contextBlocks: [{ title: "Quality Review Targets", content: JSON.stringify({ targetScore: 86 }) }],
      payload: {
        chapterId: "chapter-001",
        filePath: "chapters/chapter-001.md",
        targetScore: 86
      }
    });

    expect(prompt).toContain("Quality Review Contract");
    expect(prompt).toContain("ChapterQualityReport JSON");
    expect(prompt).toContain("openingVerdict");
    expect(prompt).toContain("endingVerdict");
    expect(prompt).toContain("antiPatternsHit");
    expect(prompt).toContain("rules-based signals");
  });
});
