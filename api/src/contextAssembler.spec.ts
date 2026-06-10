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
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.NOVEL_DB_PATH;
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
      JSON.stringify({ chapterId: "chapter-001", summary: "第一章留下血月异象。" }, null, 2),
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
    expect(knowledge?.content).toContain("state_after");
    expect(knowledge?.content).toContain("Wounded but alert.");
    expect(knowledge?.content).not.toContain("A distant unrelated fact.");
  });
});
