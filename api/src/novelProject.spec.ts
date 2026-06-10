import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton, deleteProject, importLocalProject, slugify } from "./novelProject.js";
import { listProjectRecords } from "./database.js";
import type {
  ChapterFactPatch,
  ChapterDashboard,
  ChapterSummary,
  CharacterStatePatch,
  LedgerEntry,
  SceneCard,
  WritingBriefing,
  WritingRecapCandidate
} from "./types.js";

let tempRoot = "";

afterEach(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  }
  delete process.env.NOVELS_ROOT;
  delete process.env.NOVEL_DB_PATH;
});

describe("novelProject", () => {
  it("creates a project skeleton from a rough idea", () => {
    const project = createProjectSkeleton({
      title: "Nine Gates",
      genre: "fantasy",
      roughIdea: "A grounded progression story."
    });

    expect(project.title).toBe("Nine Gates");
    expect(project.chapters).toHaveLength(3);
    expect(project.chapters[0].contentPath).toBe("chapters/chapter-001.md");
    expect(project.modules?.map((module) => module.key)).toEqual([
      "novel",
      "assets",
      "script",
      "image-generation",
      "video-generation"
    ]);
  });

  it("supports writing cockpit data contracts", () => {
    const dashboard: ChapterDashboard = {
      chapterId: "chapter-001",
      goal: "Force the protagonist to choose a cost.",
      pov: "主角",
      mainConflict: "Trust the stranger or lose the clue.",
      endingHook: "The sealed gate answers back.",
      wordCount: 1200,
      status: "drafting",
      unresolvedForeshadowingIds: ["foreshadowing-1"],
      continuityRiskIds: ["risk-1"],
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const scene: SceneCard = {
      id: "scene-1",
      chapterId: "chapter-001",
      order: 1,
      title: "Gate test",
      time: "night",
      location: "九连山",
      pov: "主角",
      characters: ["主角"],
      conflict: "The talisman reacts too early.",
      turn: "The clue costs blood.",
      informationReleased: ["The seal is weakening."],
      foreshadowingIds: ["foreshadowing-1"],
      powerProgression: "First painful response.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const ledgerEntry: LedgerEntry = {
      id: "risk-1",
      kind: "risk",
      title: "POV may know too much",
      status: "watch",
      severity: "high",
      chapterIds: ["chapter-001"],
      relatedEntities: ["主角"],
      note: "Keep the cosmic label out of narration.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const briefing: WritingBriefing = {
      chapterId: "chapter-001",
      previousChapterEnding: "The seal moved.",
      currentGoal: dashboard.goal,
      povLimits: ["主角不知道封印全貌"],
      mustRemember: ["伤势还在"],
      mustNotReveal: ["幕后势力名称"],
      unresolvedForeshadowing: [ledgerEntry],
      risks: [ledgerEntry]
    };
    const factPatch: ChapterFactPatch = {
      id: "fact-1",
      chapterId: "chapter-001",
      fact: "The seal responds to blood.",
      relatedEntities: ["sealed gate"],
      sourceAnchor: "blood touched the gate",
      status: "pending",
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const characterPatch: CharacterStatePatch = {
      id: "character-state-1",
      chapterId: "chapter-001",
      characterId: "char-protagonist",
      characterName: "主角",
      before: "Uninjured.",
      after: "Wounded but aware the seal is alive.",
      cause: "Paid blood to test the clue.",
      relatedEntities: ["sealed gate"],
      status: "pending",
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const chapterSummary: ChapterSummary = {
      chapterId: "chapter-001",
      summary: "The protagonist paid blood to test the sealed gate.",
      keyEvents: ["The talisman reacted early.", "The gate answered blood."],
      newFacts: [factPatch],
      characterStateChanges: [characterPatch],
      foreshadowingUpdates: [ledgerEntry],
      continuityRisks: [ledgerEntry],
      powerProgressionUpdates: [{ ...ledgerEntry, kind: "power" }],
      acceptedRecapIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const recap: WritingRecapCandidate = {
      chapterId: "chapter-001",
      summary: "The protagonist paid a cost.",
      newFacts: ["The seal responds to blood."],
      characterStateChanges: ["主角受伤"],
      foreshadowingUpdates: [ledgerEntry],
      continuityRisks: [ledgerEntry],
      powerProgressionUpdates: [{ ...ledgerEntry, kind: "power" }],
      createdAt: "2026-06-04T00:00:00.000Z",
      summaryPatch: { summary: chapterSummary.summary, keyEvents: chapterSummary.keyEvents },
      factPatches: [factPatch],
      ledgerPatches: [ledgerEntry],
      characterStatePatches: [characterPatch],
      riskPatches: [ledgerEntry]
    };

    expect(scene.chapterId).toBe(dashboard.chapterId);
    expect(briefing.unresolvedForeshadowing[0].id).toBe("risk-1");
    expect(chapterSummary.newFacts[0].status).toBe("pending");
    expect(recap.factPatches?.[0].fact).toBe("The seal responds to blood.");
    expect(recap.powerProgressionUpdates[0].kind).toBe("power");
  });

  it("falls back to a generated slug for non-ascii titles", () => {
    expect(slugify("九连山")).toMatch(/^novel-/);
  });

  it("creates future platform asset and script folders", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-project-platform-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    const project = createProjectSkeleton({
      title: "Platform Demo",
      genre: "fantasy",
      roughIdea: "A story that will later become video."
    });

    await createProjectFiles(project);

    const charactersDir = await fs.stat(path.join(tempRoot, "platform-demo", "assets", "characters"));
    expect(charactersDir.isDirectory()).toBe(true);
    await expect(fs.readFile(path.join(tempRoot, "platform-demo", "assets", "README.md"), "utf8")).resolves.toContain(
      "Asset Management"
    );
    await expect(fs.readFile(path.join(tempRoot, "platform-demo", "scripts", "README.md"), "utf8")).resolves.toContain(
      "Script Production"
    );
  });

  it("deletes project files and index records", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-project-delete-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    const project = createProjectSkeleton({
      title: "Delete Demo",
      genre: "fantasy",
      roughIdea: "A project that should be removable."
    });

    await createProjectFiles(project);
    await deleteProject(project.slug);

    await expect(fs.stat(path.join(tempRoot, project.slug))).rejects.toMatchObject({ code: "ENOENT" });
    expect(listProjectRecords()).toEqual([]);
  });

  it("creates writing cockpit dashboard, scenes, ledgers, memory, and recap files", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-project-cockpit-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    const project = createProjectSkeleton({
      title: "Cockpit Demo",
      genre: "fantasy",
      roughIdea: "A story that needs disciplined writing state."
    });

    await createProjectFiles(project);

    const root = path.join(tempRoot, "cockpit-demo");
    const dashboard = JSON.parse(await fs.readFile(path.join(root, "dashboard", "chapter-001.json"), "utf8"));
    const scenes = JSON.parse(await fs.readFile(path.join(root, "scenes", "chapter-001.json"), "utf8"));
    const foreshadowing = JSON.parse(await fs.readFile(path.join(root, "ledger", "foreshadowing.json"), "utf8"));
    const continuity = JSON.parse(await fs.readFile(path.join(root, "ledger", "continuity.json"), "utf8"));
    const powerProgression = JSON.parse(await fs.readFile(path.join(root, "ledger", "power-progression.json"), "utf8"));
    const characterState = JSON.parse(await fs.readFile(path.join(root, "ledger", "character-state.json"), "utf8"));
    const risks = JSON.parse(await fs.readFile(path.join(root, "ledger", "risks.json"), "utf8"));
    const memoryDir = await fs.stat(path.join(root, "memory", "chapter-summaries"));
    const chapterSummary = JSON.parse(
      await fs.readFile(path.join(root, "memory", "chapter-summaries", "chapter-001.json"), "utf8")
    );
    const recaps = await fs.readFile(path.join(root, "tasks", "recaps.jsonl"), "utf8");

    expect(dashboard).toEqual(
      expect.objectContaining({
        chapterId: "chapter-001",
        goal: "",
        pov: "",
        mainConflict: "",
        endingHook: "",
        wordCount: 0,
        status: "empty",
        unresolvedForeshadowingIds: [],
        continuityRiskIds: []
      })
    );
    expect(dashboard.updatedAt).toEqual(expect.any(String));
    expect(scenes).toEqual([]);
    expect(foreshadowing).toEqual([]);
    expect(continuity).toEqual([]);
    expect(powerProgression).toEqual([]);
    expect(characterState).toEqual([]);
    expect(risks).toEqual([]);
    expect(memoryDir.isDirectory()).toBe(true);
    expect(chapterSummary).toEqual(
      expect.objectContaining({
        chapterId: "chapter-001",
        summary: "",
        keyEvents: [],
        newFacts: [],
        characterStateChanges: [],
        foreshadowingUpdates: [],
        continuityRisks: [],
        powerProgressionUpdates: [],
        acceptedRecapIds: []
      })
    );
    expect(chapterSummary.updatedAt).toEqual(expect.any(String));
    for (const chapter of project.chapters) {
      await expect(
        fs.readFile(path.join(root, "memory", "chapter-summaries", `${chapter.id}.json`), "utf8")
      ).resolves.toContain(`"chapterId": "${chapter.id}"`);
    }
    expect(recaps).toBe("");
  });

  it("imports a structured novel repository without mixing chapter cards into chapters", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-project-import-"));
    const sourceRoot = path.join(tempRoot, "source");
    const novelsRoot = path.join(tempRoot, "novels");
    process.env.NOVELS_ROOT = novelsRoot;
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");

    await fs.mkdir(path.join(sourceRoot, ".codex", "skills", "chapter-polisher"), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, "01-角色设定", "双女主"), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, "02-故事大纲", "主线剧情"), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, "03-章节正文", "第一卷-开端"), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, "05-事件年表"), { recursive: true });

    await fs.writeFile(path.join(sourceRoot, ".codex", "skills", "chapter-polisher", "SKILL.md"), "# Tooling Skill\n", "utf8");
    await fs.writeFile(
      path.join(sourceRoot, "01-角色设定", "双女主", "索菲亚-校花.md"),
      "# 索菲亚\n\n目标：确认主角到底隐瞒了什么。\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(sourceRoot, "02-故事大纲", "主线剧情", "整体规划.md"),
      "# 全文大纲\n\n主角进入异界后建立第一阶段目标。\n",
      "utf8"
    );
    await fs.writeFile(path.join(sourceRoot, "03-章节正文", "第一卷-开端", "第1章 开场.md"), "# 第1章 开场\n\n正文一。\n", "utf8");
    await fs.writeFile(path.join(sourceRoot, "03-章节正文", "第一卷-开端", "第2章 推进.md"), "# 第2章 推进\n\n正文二。\n", "utf8");
    await fs.writeFile(
      path.join(sourceRoot, "03-章节正文", "第一卷-开端", "第2章章节卡.md"),
      "# 第2章章节卡\n\n这一章的卡片，不是正文。\n",
      "utf8"
    );
    await fs.writeFile(path.join(sourceRoot, "05-事件年表", "主线事件.md"), "# 主线事件\n\n第1章触发异界入口。\n", "utf8");

    const project = await importLocalProject({ sourcePath: sourceRoot, title: "Structured Import" });
    const root = path.join(novelsRoot, project.slug);
    const storyControl = JSON.parse(await fs.readFile(path.join(root, "story-control", "story-control.json"), "utf8"));
    const outline = await fs.readFile(path.join(root, "outline", "volume-01.md"), "utf8");
    const characters = await fs.readFile(path.join(root, "bible", "characters.md"), "utf8");

    expect(project.chapters).toHaveLength(2);
    expect(project.chapters.map((chapter) => chapter.title)).toEqual(["第1章 开场", "第2章 推进"]);
    expect(project.chapters[0]).toEqual(
      expect.objectContaining({
        order: 1,
        volumeTitle: "第一卷-开端"
      })
    );
    expect(outline).toContain("第2章章节卡");
    expect(characters).toContain("索菲亚");
    expect(characters).not.toContain("Tooling Skill");
    expect(storyControl.arcs.some((arc: { title: string }) => arc.title.includes("全文大纲"))).toBe(true);
    expect(storyControl.characters.some((character: { name: string }) => character.name.includes("索菲亚"))).toBe(true);
    expect(storyControl.events.some((event: { title: string }) => event.title.includes("主线事件"))).toBe(true);
  });

  it("imports planned chapter cards without treating scripts as chapter bodies", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-project-plan-import-"));
    const sourceRoot = path.join(tempRoot, "source");
    const novelsRoot = path.join(tempRoot, "novels");
    process.env.NOVELS_ROOT = novelsRoot;
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");

    await fs.mkdir(path.join(sourceRoot, "03-chapters", "volume-001"), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, "02-outline", "main"), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, "04-scripts"), { recursive: true });

    await fs.writeFile(path.join(sourceRoot, "03-chapters", "volume-001", "chapter-001.md"), "# Chapter One\n\nBody one.\n", "utf8");
    await fs.writeFile(path.join(sourceRoot, "03-chapters", "volume-001", "chapter-002.md"), "# Chapter Two\n\nBody two.\n", "utf8");
    await fs.writeFile(
      path.join(sourceRoot, "04-scripts", "chapter-001-video-prompt.md"),
      "# 《魔道尸祖》即梦AI视频生成提示词（统一画风版）\n\nThis is production material, not body text.\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(sourceRoot, "02-outline", "main", "chapter-card-003-004.md"),
      [
        "# 第3-4章重构分章卡",
        "",
        "## 第3章章节卡",
        "- 章节号与标题：第3章《计划章三》",
        "- 核心事件：主角进入异界。",
        "",
        "## 第4章章节卡",
        "- 章节号与标题：第4章《计划章四》",
        "- 核心事件：穿越规则第一次反噬。"
      ].join("\n"),
      "utf8"
    );

    const project = await importLocalProject({ sourcePath: sourceRoot, title: "Planned Import" });
    const root = path.join(novelsRoot, project.slug);
    const report = JSON.parse(await fs.readFile(path.join(root, "imports", "import-report.json"), "utf8"));
    const plannedOutline = await fs.readFile(path.join(root, "outline", "chapter-003.md"), "utf8");

    expect(project.chapters).toHaveLength(4);
    expect(project.chapters.map((chapter) => chapter.id)).toEqual(["chapter-001", "chapter-002", "chapter-003", "chapter-004"]);
    expect(project.chapters.map((chapter) => chapter.status)).toEqual(["drafted", "drafted", "planned", "planned"]);
    expect(project.chapters.map((chapter) => chapter.title)).toContain("第3章 计划章三");
    expect(project.chapters.map((chapter) => chapter.title)).not.toContain("《魔道尸祖》即梦AI视频生成提示词（统一画风版）");
    expect(report).toEqual(expect.objectContaining({ chapters: 4, draftedChapters: 2, plannedChapters: 2 }));
    expect(plannedOutline).toContain("Imported planning source: 02-outline/main/chapter-card-003-004.md");
    expect(plannedOutline).toContain("核心事件：主角进入异界。");
  });
});
