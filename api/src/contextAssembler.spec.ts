import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleContext } from "./contextAssembler.js";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";

let tempRoot = "";

describe("contextAssembler", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-context-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    process.env.PLATFORM_ROOT = path.join(tempRoot, "platform");
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.NOVEL_DB_PATH;
    delete process.env.PLATFORM_ROOT;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("injects project, bible, outline, ledger, and target chapter context for draft tasks", async () => {
    const project = createProjectSkeleton({ title: "Context Demo", roughIdea: "Context matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await fs.writeFile(path.join(root, "bible", "characters.md"), "Hero knows only local facts.", "utf8");
    await fs.writeFile(path.join(root, "outline", "volume-01.md"), "Volume plan with causal steps.", "utf8");

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });

    expect(blocks.length).toBeGreaterThanOrEqual(9);
    expect(blocks.some((block) => block.content.includes('"slug": "context-demo"'))).toBe(true);
    expect(blocks.some((block) => block.content.includes("Hero knows only local facts."))).toBe(true);
    expect(blocks.some((block) => block.content.includes("Volume plan with causal steps."))).toBe(true);
  });

  it("injects a narrative promise lock near the top of writing context", async () => {
    const project = createProjectSkeleton({
      title: "尸王破封",
      genre: "玄幻",
      roughIdea: [
        "类型：玄幻悬疑",
        "核心冲突：少年必须借尸王封印换取活路，但每次借力都会让封印松动。",
        "开篇钩子：天狗食月时尸王破封，主角被迫穿越入局。"
      ].join("\n")
    });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const projectIndex = blocks.findIndex((block) => block.title === "项目配置");
    const promiseIndex = blocks.findIndex((block) => block.title === "叙事承诺锁");
    const genreIndex = blocks.findIndex((block) => block.title === "玄幻题材 Profile");
    const promise = blocks[promiseIndex]?.content || "";

    expect(projectIndex).toBeGreaterThanOrEqual(0);
    expect(promiseIndex).toBe(projectIndex + 1);
    expect(genreIndex).toBe(promiseIndex + 1);
    expect(promise).toContain("书名承诺：尸王破封");
    expect(promise).toContain("类型信号：玄幻悬疑");
    expect(promise).toContain("核心冲突：少年必须借尸王封印换取活路");
    expect(promise).toContain("开篇钩子：天狗食月时尸王破封");
    expect(promise).toContain("前 12 章只加压");
    expect(promise).toContain("尸王");
    expect(promise).toContain("穿越");
    expect(blocks[genreIndex]?.content).toContain("升级必须有代价");
    expect(blocks.at(-1)?.title).toBe("上下文预算日志");
  });

  it("records context budget truncation when large blocks are compressed", async () => {
    const project = createProjectSkeleton({ title: "Budget Demo", roughIdea: "Context budget matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await fs.writeFile(path.join(root, "bible", "world.md"), "A".repeat(14000), "utf8");

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const budget = JSON.parse(blocks.at(-1)?.content || "{}") as {
      version?: string;
      tiers?: Record<string, { blockCount: number; truncatedBlocks: string[] }>;
      blockPlan?: Array<{ title: string; tier: string; truncated: boolean }>;
      truncatedBlocks?: Array<{ title: string; tier: string }>;
      totalOriginalChars?: number;
      totalFinalChars?: number;
    };

    expect(blocks.at(-1)?.title).toBe("上下文预算日志");
    expect(budget.version).toBe("context-budget:v2");
    expect(budget.tiers?.T0.blockCount).toBeGreaterThanOrEqual(1);
    expect(budget.tiers?.T1.truncatedBlocks).toContain("世界观");
    expect(budget.blockPlan?.find((block) => block.title === "世界观")).toMatchObject({ tier: "T1", truncated: true });
    expect(budget.truncatedBlocks).toContainEqual(expect.objectContaining({ title: "世界观", tier: "T1" }));
    expect(budget.totalOriginalChars).toBeGreaterThan(budget.totalFinalChars || 0);
  });

  it("uses a project-level genre profile override when present", async () => {
    const project = createProjectSkeleton({ title: "Override Demo", genre: "玄幻", roughIdea: "题材规则应被项目覆盖。" });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await fs.writeFile(
      path.join(root, "bible", "genre-profile.json"),
      JSON.stringify(
        {
          title: "自定义题材 Profile",
          directives: ["每次借力都必须留下血债。", "所有奇观必须改变人物关系。"],
          risks: ["避免系统白送奖励。"]
        },
        null,
        2
      ),
      "utf8"
    );

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const profile = blocks.find((block) => block.title === "自定义题材 Profile");

    expect(profile?.content).toContain("来源：项目题材 Profile");
    expect(profile?.content).toContain("每次借力都必须留下血债。");
    expect(profile?.content).not.toContain("升级必须有代价");
  });

  it("injects the default craft profile into draft context", async () => {
    const project = createProjectSkeleton({ title: "Craft Demo", genre: "xuanhuan", roughIdea: "Craft matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const profile = blocks.find((block) => block.title === "Craft Profile");

    expect(profile?.content).toContain("Novel craft autopilot profile");
    expect(profile?.content).toContain("payoff");
    expect(profile?.content).toContain("matchedGenreProfiles");
    expect(profile?.content).toContain("original eastern epic fantasy direction");
    expect(profile?.content).toContain("concrete sensory pressure");
    expect(profile?.content).toContain("derivative imitation of a specific novel or author");
  });

  it("injects the long novel writer playbook when the system skill is enabled", async () => {
    const project = createProjectSkeleton({ title: "Longform Demo", genre: "fantasy", roughIdea: "Quality-first drafting matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const longformSkill = blocks.find((block) => block.title === "Long Novel Writer Skill");
    const activeSkills = blocks.find((block) => block.title === "Active Novel Skills");

    expect(longformSkill?.content).toContain("qualityPriority");
    expect(longformSkill?.content).toContain("irreversible chapter change");
    expect(longformSkill?.content).toContain("visible price");
    expect(activeSkills?.content).toContain("long-novel-writer");
    expect(activeSkills?.content).toContain("novel-continuity-check");
  });

  it("reads platform skills during context assembly without persisting the platform library", async () => {
    const project = createProjectSkeleton({ title: "Platform Snapshot", genre: "fantasy", roughIdea: "Context reads should stay side-effect free." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const platformLibraryPath = path.join(process.env.PLATFORM_ROOT || "", "library.json");

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });

    expect(blocks.some((block) => block.title === "Active Novel Skills")).toBe(true);
    await expect(fs.access(platformLibraryPath)).rejects.toThrow();
  });

  it("uses a project-level craft profile override when present", async () => {
    const project = createProjectSkeleton({ title: "Craft Override", genre: "romance", roughIdea: "Project craft rules should win." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await fs.writeFile(
      path.join(root, "bible", "craft-profile.json"),
      JSON.stringify(
        {
          version: 1,
          title: "Custom craft lab",
          principles: ["Every quiet dinner must move a relationship or clue."],
          qualityGates: ["Reject inert daily scenes."]
        },
        null,
        2
      ),
      "utf8"
    );

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const profile = blocks.find((block) => block.title === "Craft Profile");

    expect(profile?.content).toContain("project");
    expect(profile?.content).toContain("Custom craft lab");
    expect(profile?.content).toContain("Every quiet dinner must move a relationship or clue.");
  });

  it("limits selection polish context to the selected range and nearby text", async () => {
    const project = createProjectSkeleton({ title: "Selection Demo", roughIdea: "Selection matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);

    const blocks = await assembleContext("selection.polish", root, project, {
      selection: {
        mode: "polish",
        beforeText: "before",
        selectedText: "plain line",
        afterText: "after"
      }
    });

    const selectionBlock = blocks.find((block) => block.content.includes("plain line"));
    expect(selectionBlock?.content).toContain("polish");
    expect(selectionBlock?.content).toContain("before");
    expect(selectionBlock?.content).toContain("after");
  });

  it("injects dashboard, scene cards, and structured ledgers before target draft text", async () => {
    const project = createProjectSkeleton({ title: "Cockpit Context", roughIdea: "Structure matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);

    await fs.writeFile(
      path.join(root, "dashboard", "chapter-001.json"),
      JSON.stringify(
        {
          chapterId: "chapter-001",
          goal: "Make the price of the clue visible.",
          pov: "Hero",
          mainConflict: "Stay hidden or act.",
          endingHook: "The seal answers.",
          wordCount: 900,
          status: "drafting",
          unresolvedForeshadowingIds: ["f-1"],
          continuityRiskIds: ["risk-1"],
          updatedAt: "2026-06-04T00:00:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "scenes", "chapter-001.json"),
      JSON.stringify([{ id: "scene-1", title: "Pressure before action", order: 1 }], null, 2),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "ledger", "risks.json"),
      JSON.stringify([{ id: "risk-1", kind: "risk", title: "POV boundary" }], null, 2),
      "utf8"
    );
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "TARGET DRAFT MARKER", "utf8");

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const joined = blocks.map((block) => `${block.title}\n${block.content}`).join("\n\n");
    const sceneIndex = joined.indexOf("Pressure before action");
    const targetDraftIndex = joined.indexOf("TARGET DRAFT MARKER");

    expect(joined).toContain("Make the price of the clue visible.");
    expect(joined).toContain("Pressure before action");
    expect(joined).toContain("POV boundary");
    expect(sceneIndex).toBeGreaterThan(-1);
    expect(targetDraftIndex).toBeGreaterThan(-1);
    expect(sceneIndex).toBeLessThan(targetDraftIndex);
  });

  it("injects adjacent and related distant chapter summaries into writing context", async () => {
    const project = createProjectSkeleton({ title: "Memory Context", roughIdea: "Memory matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    project.chapters.push(
      {
        id: "chapter-002",
        title: "第二章",
        outlinePath: "outline/chapter-002.md",
        contentPath: "chapters/chapter-002.md",
        status: "planned",
        order: 2,
        volumeId: "volume-001",
        volumeTitle: "第一卷",
        volumeOrder: 1
      },
      {
        id: "chapter-003",
        title: "第三章",
        outlinePath: "outline/chapter-003.md",
        contentPath: "chapters/chapter-003.md",
        status: "planned",
        order: 3,
        volumeId: "volume-001",
        volumeTitle: "第一卷",
        volumeOrder: 1
      },
      {
        id: "chapter-010",
        title: "第十章",
        outlinePath: "outline/chapter-010.md",
        contentPath: "chapters/chapter-010.md",
        status: "planned",
        order: 10,
        volumeId: "volume-001",
        volumeTitle: "第一卷",
        volumeOrder: 1
      }
    );
    await fs.mkdir(path.join(root, "memory", "chapter-summaries"), { recursive: true });
    await fs.writeFile(
      path.join(root, "memory", "chapter-summaries", "chapter-001.json"),
      JSON.stringify(
        {
          chapterId: "chapter-001",
          summary: "第一章留下血月异象。",
          emotionLedger: {
            wounds: [
              {
                id: "emotion-wound-1",
                chapterId: "chapter-001",
                characterName: "主角",
                description: "他意识到求生必须付出血的代价。",
                status: "open",
                relatedEntities: ["血月"],
                updatedAt: "2026-06-10T00:00:00.000Z"
              }
            ],
            boons: [],
            powerShifts: [],
            openLoops: []
          }
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "memory", "chapter-summaries", "chapter-003.json"),
      JSON.stringify({ chapterId: "chapter-003", summary: "第三章承接封印松动。" }, null, 2),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "memory", "chapter-summaries", "chapter-010.json"),
      JSON.stringify({ chapterId: "chapter-010", summary: "第十章兑现尸王伏笔。" }, null, 2),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "ledger", "foreshadowing.json"),
      JSON.stringify(
        [
          {
            id: "far-link",
            kind: "foreshadowing",
            title: "血月伏笔",
            status: "open",
            severity: "medium",
            chapterIds: ["chapter-002", "chapter-010"],
            relatedEntities: ["血月"],
            note: "第十章回收第二章的异象。",
            updatedAt: "2026-06-10T00:00:00.000Z"
          }
        ],
        null,
        2
      ),
      "utf8"
    );

    const blocks = await assembleContext("writing.briefing", root, project, { chapterId: "chapter-002" });
    const adjacent = blocks.find((block) => block.title === "相邻章节摘要");
    const distant = blocks.find((block) => block.title === "相关远章摘要");

    expect(adjacent?.content).toContain("第一章留下血月异象。");
    expect(adjacent?.content).toContain("他意识到求生必须付出血的代价。");
    expect(adjacent?.content).toContain("第三章承接封印松动。");
    expect(distant?.content).toContain("第十章兑现尸王伏笔。");
  });

  it("injects persisted knowledge index facts for the target chapter", async () => {
    const project = createProjectSkeleton({ title: "Knowledge Context", roughIdea: "Indexed memory should guide drafting." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await fs.writeFile(
      path.join(root, "knowledge", "facts.jsonl"),
      `${JSON.stringify({
        id: "fact:gate-blood",
        text: "The sealed gate responds to blood.",
        chapterIds: ["chapter-001"],
        relatedEntities: ["Hero", "sealed gate"],
        keywords: ["gate", "blood"],
        source: { type: "chapter-summary", id: "fact-gate-blood" },
        updatedAt: "2026-06-11T00:00:00.000Z"
      })}\n${JSON.stringify({
        id: "fact:future-gate-cost",
        text: "The tenth chapter reveals that Hero's blood debt follows every sealed gate.",
        chapterIds: ["chapter-010"],
        relatedEntities: ["Hero", "sealed gate"],
        keywords: ["gate", "blood"],
        source: { type: "chapter-summary", id: "future-gate-cost" },
        updatedAt: "2026-06-11T00:00:00.000Z"
      })}\n${JSON.stringify({
        id: "fact:other",
        text: "A distant unrelated fact.",
        chapterIds: ["chapter-003"],
        relatedEntities: [],
        keywords: ["other"],
        source: { type: "chapter-summary", id: "other" },
        updatedAt: "2026-06-11T00:00:00.000Z"
      })}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "knowledge", "triples.jsonl"),
      `${JSON.stringify({
        id: "triple:hero-state",
        subject: "Hero",
        predicate: "state_after",
        object: "Wounded but alert.",
        chapterIds: ["chapter-001"],
        sourceFactIds: ["fact:gate-blood"],
        updatedAt: "2026-06-11T00:00:00.000Z"
      })}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "memory", "chapter-index.json"),
      JSON.stringify(
        {
          projectSlug: project.slug,
          chapters: [
            {
              chapterId: "chapter-001",
              title: "Chapter 1",
              keywords: ["gate", "blood"],
              factIds: ["fact:gate-blood"],
              tripleIds: ["triple:hero-state"],
              entityNames: ["Hero"],
              updatedAt: "2026-06-11T00:00:00.000Z"
            }
          ],
          keywords: { gate: ["chapter-001"], blood: ["chapter-001"] },
          updatedAt: "2026-06-11T00:00:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const knowledge = blocks.find((block) => block.title === "Knowledge Memory Index");

    expect(knowledge?.content).toContain("The sealed gate responds to blood.");
    expect(knowledge?.content).toContain("The tenth chapter reveals that Hero's blood debt follows every sealed gate.");
    expect(knowledge?.content).toContain("state_after");
    expect(knowledge?.content).toContain("Wounded but alert.");
    expect(knowledge?.content).not.toContain("A distant unrelated fact.");
  });
});
