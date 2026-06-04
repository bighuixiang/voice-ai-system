import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton, slugify } from "./novelProject.js";
import type {
  ChapterDashboard,
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
    const recap: WritingRecapCandidate = {
      chapterId: "chapter-001",
      summary: "The protagonist paid a cost.",
      newFacts: ["The seal responds to blood."],
      characterStateChanges: ["主角受伤"],
      foreshadowingUpdates: [ledgerEntry],
      continuityRisks: [ledgerEntry],
      powerProgressionUpdates: [{ ...ledgerEntry, kind: "power" }],
      createdAt: "2026-06-04T00:00:00.000Z"
    };

    expect(scene.chapterId).toBe(dashboard.chapterId);
    expect(briefing.unresolvedForeshadowing[0].id).toBe("risk-1");
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

  it("creates writing cockpit dashboard, scenes, ledgers, and recap files", async () => {
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
    expect(recaps).toBe("");
  });
});
