import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNovelStore } from "./novel";
import type {
  ChapterDashboard,
  LedgerEntry,
  NovelProject,
  NovelTask,
  SceneCard,
  WritingBriefing,
  WritingRecapCandidate
} from "@/types/novel";

const mockNovelApi = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  importProject: vi.fn(),
  readPlatformLibrary: vi.fn(),
  createPlatformAsset: vi.fn(),
  linkPlatformAsset: vi.fn(),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  readChapterDashboard: vi.fn(),
  saveChapterDashboard: vi.fn(),
  readSceneCards: vi.fn(),
  saveSceneCards: vi.fn(),
  readLedgerEntries: vi.fn(),
  saveLedgerEntries: vi.fn(),
  runTask: vi.fn(),
  polishSelection: vi.fn(),
  applyPatches: vi.fn()
}));

vi.mock("@/services/novelApi", () => ({
  novelApi: mockNovelApi
}));

const project: NovelProject = {
  id: "demo",
  slug: "demo",
  title: "Demo Novel",
  genre: "fantasy",
  roughIdea: "A careful hero opens a sealed gate.",
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
  lastOpenedChapterId: "chapter-002",
  codex: { command: "codex" },
  chapters: [
    {
      id: "chapter-001",
      title: "Chapter 1",
      outlinePath: "outline/chapter-001.md",
      contentPath: "chapters/chapter-001.md",
      status: "drafted"
    },
    {
      id: "chapter-002",
      title: "Chapter 2",
      outlinePath: "outline/chapter-002.md",
      contentPath: "chapters/chapter-002.md",
      status: "planned"
    }
  ]
};

const platformLibrary = {
  version: 1 as const,
  assets: [
    {
      id: "asset-1",
      name: "Shared Sword",
      type: "prop" as const,
      scope: "shared" as const,
      tags: [],
      linkedProjects: ["other"],
      relatedNovelItems: [],
      createdAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:00.000Z"
    }
  ],
  prompts: [],
  roles: [],
  skills: [],
  updatedAt: "2026-06-03T00:00:00.000Z"
};

function taskWithResult(overrides: Partial<NovelTask> = {}): NovelTask {
  return {
    id: "task-1",
    type: "idea.suggest",
    status: "success",
    projectId: "demo",
    inputSummary: "chapter-002",
    outputSummary: "Generated ideas",
    startedAt: "2026-06-03T00:00:00.000Z",
    result: {
      summary: "Generated ideas",
      content: "Try a quieter reversal.",
      changes: ["Added a causal beat"],
      risks: [],
      questions: [],
      patches: []
    },
    ...overrides
  };
}

describe("useNovelStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockNovelApi.readFile.mockImplementation(async (_projectId: string, filePath: string) => {
      if (filePath.startsWith("chapters/")) return `draft:${filePath}`;
      return `support:${filePath}`;
    });
    mockNovelApi.saveFile.mockResolvedValue(undefined);
    mockNovelApi.readChapterDashboard.mockImplementation(async (_projectId: string, chapterId: string) => ({
      chapterId,
      goal: "",
      pov: "",
      mainConflict: "",
      endingHook: "",
      wordCount: 0,
      status: "planned",
      unresolvedForeshadowingIds: [],
      continuityRiskIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    }));
    mockNovelApi.saveChapterDashboard.mockImplementation(async (_projectId: string, dashboard: ChapterDashboard) => dashboard);
    mockNovelApi.readSceneCards.mockResolvedValue([]);
    mockNovelApi.saveSceneCards.mockImplementation(async (_projectId: string, _chapterId: string, cards: SceneCard[]) => cards);
    mockNovelApi.readLedgerEntries.mockResolvedValue([]);
    mockNovelApi.saveLedgerEntries.mockImplementation(async (_projectId: string, _kind: LedgerEntry["kind"], entries: LedgerEntry[]) => entries);
    mockNovelApi.applyPatches.mockResolvedValue(undefined);
    mockNovelApi.readPlatformLibrary.mockResolvedValue(platformLibrary);
    mockNovelApi.createPlatformAsset.mockResolvedValue({
      ...platformLibrary.assets[0],
      id: "asset-2",
      name: "New Shared Asset",
      linkedProjects: ["demo"]
    });
    mockNovelApi.linkPlatformAsset.mockResolvedValue({
      ...platformLibrary.assets[0],
      linkedProjects: ["other", "demo"]
    });
  });

  it("loads projects without automatically entering a workspace", async () => {
    mockNovelApi.listProjects.mockResolvedValue([project]);

    const store = useNovelStore();
    await store.loadProjects();

    expect(store.projects).toEqual([project]);
    expect(store.currentProject).toBeNull();
    expect(store.openWorkspaceProjects).toEqual([]);
  });

  it("accepts writing cockpit data contract fixtures", () => {
    const dashboard: ChapterDashboard = {
      chapterId: "chapter-001",
      goal: "Make the price of the clue visible.",
      pov: "主角",
      mainConflict: "Leave safely or inspect the seal.",
      endingHook: "The mark answers.",
      wordCount: 900,
      status: "reviewing",
      unresolvedForeshadowingIds: ["foreshadowing-1"],
      continuityRiskIds: ["risk-1"],
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const scene: SceneCard = {
      id: "scene-1",
      chapterId: "chapter-001",
      order: 1,
      title: "Seal response",
      time: "night",
      location: "九连山",
      pov: "主角",
      characters: ["主角"],
      conflict: "The seal demands a cost.",
      turn: "The clue appears only after pain.",
      informationReleased: ["The seal reacts to blood."],
      foreshadowingIds: ["foreshadowing-1"],
      powerProgression: "First controlled response.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const ledgerEntry: LedgerEntry = {
      id: "risk-1",
      kind: "continuity",
      title: "Known information boundary",
      status: "open",
      severity: "medium",
      chapterIds: ["chapter-001"],
      relatedEntities: ["主角"],
      note: "Use felt experience instead of cosmic labels.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const briefing: WritingBriefing = {
      chapterId: "chapter-001",
      previousChapterEnding: "The gate moved.",
      currentGoal: dashboard.goal,
      povLimits: ["主角不能知道幕后势力"],
      mustRemember: ["伤口未愈"],
      mustNotReveal: ["封印源头"],
      unresolvedForeshadowing: [ledgerEntry],
      risks: [ledgerEntry]
    };
    const recap: WritingRecapCandidate = {
      chapterId: "chapter-001",
      summary: "A cost was paid for the clue.",
      newFacts: ["Blood can wake the mark."],
      characterStateChanges: ["主角对封印更警惕"],
      foreshadowingUpdates: [ledgerEntry],
      continuityRisks: [ledgerEntry],
      powerProgressionUpdates: [{ ...ledgerEntry, kind: "power" }],
      createdAt: "2026-06-04T00:00:00.000Z"
    };

    expect(scene.chapterId).toBe(dashboard.chapterId);
    expect(briefing.risks).toHaveLength(1);
    expect(recap.foreshadowingUpdates[0].status).toBe("open");
  });

  it("loads the platform library for shared assets, prompts, roles, and skills", async () => {
    const store = useNovelStore();

    await store.loadPlatformLibrary();

    expect(mockNovelApi.readPlatformLibrary).toHaveBeenCalled();
    expect(store.platformLibrary?.assets[0].name).toBe("Shared Sword");
  });

  it("creates a shared asset and refreshes the platform library", async () => {
    const store = useNovelStore();
    store.currentProject = project;

    const asset = await store.createSharedAsset({ name: "New Shared Asset", type: "scene" });

    expect(mockNovelApi.createPlatformAsset).toHaveBeenCalledWith({
      name: "New Shared Asset",
      type: "scene",
      scope: "shared",
      projectSlug: "demo"
    });
    expect(asset.name).toBe("New Shared Asset");
    expect(mockNovelApi.readPlatformLibrary).toHaveBeenCalled();
  });

  it("links a shared asset to the current project", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    store.platformLibrary = platformLibrary;

    await store.linkSharedAsset(platformLibrary.assets[0]);

    expect(mockNovelApi.linkPlatformAsset).toHaveBeenCalledWith("asset-1", "demo");
    expect(store.currentProjectAssets.map((asset) => asset.id)).toEqual(["asset-1"]);
  });

  it("opens a project workspace and restores the last active chapter plus support file", async () => {
    const store = useNovelStore();
    store.projects = [project];

    await store.openProject(project);

    expect(store.currentProject?.slug).toBe("demo");
    expect(store.openWorkspaceProjects.map((item) => item.slug)).toEqual(["demo"]);
    expect(store.currentChapter?.id).toBe("chapter-002");
    expect(store.currentContent).toBe("draft:chapters/chapter-002.md");
    expect(store.supportContent).toBe("support:bible/characters.md");
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("loads dashboard, scene cards, and ledger data for the active workspace", async () => {
    const scenes: SceneCard[] = [
      {
        id: "scene-1",
        chapterId: "chapter-002",
        order: 1,
        title: "Quiet pressure",
        time: "night",
        location: "Gate",
        pov: "Hero",
        characters: ["Hero"],
        conflict: "Stay hidden.",
        turn: "The gate reacts.",
        informationReleased: [],
        foreshadowingIds: [],
        powerProgression: "",
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    ];
    mockNovelApi.readSceneCards.mockResolvedValueOnce(scenes);

    const store = useNovelStore();
    store.projects = [project];
    await store.openProject(project);

    expect(mockNovelApi.readChapterDashboard).toHaveBeenCalledWith("demo", "chapter-002");
    expect(mockNovelApi.readSceneCards).toHaveBeenCalledWith("demo", "chapter-002");
    expect(mockNovelApi.readLedgerEntries).toHaveBeenCalledWith("demo", "foreshadowing");
    expect(store.currentDashboard?.chapterId).toBe("chapter-002");
    expect(store.sceneCards).toEqual(scenes);
    expect(store.activeLedgerKind).toBe("foreshadowing");
  });

  it("keeps each opened workspace cached while switching projects", async () => {
    const otherProject: NovelProject = {
      ...project,
      id: "other",
      slug: "other",
      title: "Other Novel",
      lastOpenedChapterId: "chapter-001"
    };
    const store = useNovelStore();
    store.projects = [project, otherProject];

    await store.openProject(project);
    store.updateContent("dirty cached draft");
    store.updateSupportContent("dirty support notes");
    store.updateDashboard({ goal: "Cached chapter goal" });
    store.updateSceneCards([
      {
        id: "scene-cached",
        chapterId: "chapter-002",
        order: 1,
        title: "Cached scene",
        time: "night",
        location: "Gate",
        pov: "Hero",
        characters: ["Hero"],
        conflict: "Keep the clue.",
        turn: "The clue changes hands.",
        informationReleased: [],
        foreshadowingIds: [],
        powerProgression: "",
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    ]);

    await store.openProject(otherProject, { skipLeaveCheck: true });
    expect(store.currentProject?.slug).toBe("other");

    await store.openProject(project, { skipLeaveCheck: true });

    expect(store.currentProject?.slug).toBe("demo");
    expect(store.currentContent).toBe("dirty cached draft");
    expect(store.supportContent).toBe("dirty support notes");
    expect(store.currentDashboard?.goal).toBe("Cached chapter goal");
    expect(store.sceneCards.map((scene) => scene.id)).toEqual(["scene-cached"]);
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.openWorkspaceProjects.map((item) => item.slug)).toEqual(["demo", "other"]);
  });

  it("switches writing mode and restores it with the workspace cache", async () => {
    const otherProject: NovelProject = {
      ...project,
      id: "other",
      slug: "other",
      title: "Other Novel",
      lastOpenedChapterId: "chapter-001"
    };
    const store = useNovelStore();
    store.projects = [project, otherProject];

    await store.openProject(project);
    store.setWritingMode("review");
    await store.openProject(otherProject, { skipLeaveCheck: true });
    store.setWritingMode("focus");
    await store.openProject(project, { skipLeaveCheck: true });

    expect(store.writingMode).toBe("review");
  });

  it("switches between chapter body and chapter outline documents", async () => {
    const store = useNovelStore();
    store.currentProject = project;

    await store.openChapter(project.chapters[0]);
    await store.openChapterDocument("outline");

    expect(store.currentDocumentKind).toBe("outline");
    expect(store.currentDocumentLabel).toBe("章纲设定");
    expect(store.currentFilePath).toBe("outline/chapter-001.md");
    expect(store.currentContent).toBe("support:outline/chapter-001.md");
  });

  it("auto-saves the current chapter document before switching body and outline", async () => {
    const store = useNovelStore();
    store.currentProject = project;

    await store.openChapter(project.chapters[0]);
    store.updateContent("dirty chapter body");
    await store.openChapterDocument("outline");

    expect(mockNovelApi.saveFile).toHaveBeenCalledWith("demo", "chapters/chapter-001.md", "dirty chapter body");
    expect(store.currentDocumentKind).toBe("outline");
    expect(store.currentFilePath).toBe("outline/chapter-001.md");
  });

  it("does not switch chapters when the dirty editor confirmation is cancelled", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent("unsaved draft");

    await store.openChapter(project.chapters[1]);

    expect(window.confirm).toHaveBeenCalled();
    expect(store.currentChapter?.id).toBe("chapter-001");
    expect(store.currentContent).toBe("unsaved draft");
    expect(mockNovelApi.readFile).toHaveBeenCalledTimes(1);
  });

  it("switches chapters when the dirty editor confirmation is accepted", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent("unsaved draft");

    await store.openChapter(project.chapters[1]);

    expect(window.confirm).toHaveBeenCalled();
    expect(store.currentChapter?.id).toBe("chapter-002");
    expect(store.currentContent).toBe("draft:chapters/chapter-002.md");
  });

  it("creates a project then opens it in the editor", async () => {
    mockNovelApi.createProject.mockResolvedValue(project);

    const store = useNovelStore();
    await store.createProject({ title: "Demo Novel", roughIdea: "A careful hero opens a sealed gate." });

    expect(mockNovelApi.createProject).toHaveBeenCalledWith({
      title: "Demo Novel",
      roughIdea: "A careful hero opens a sealed gate."
    });
    expect(store.projects[0].slug).toBe("demo");
    expect(store.openWorkspaceProjects.map((item) => item.slug)).toEqual(["demo"]);
    expect(store.currentChapter?.id).toBe("chapter-002");
    expect(store.isLoading).toBe(false);
  });

  it("imports a local folder then opens the managed project", async () => {
    mockNovelApi.importProject.mockResolvedValue(project);

    const store = useNovelStore();
    await store.importProject({ sourcePath: "D:\\novels\\old-story", title: "Demo Novel" });

    expect(mockNovelApi.importProject).toHaveBeenCalledWith({
      sourcePath: "D:\\novels\\old-story",
      title: "Demo Novel"
    });
    expect(store.projects[0].slug).toBe("demo");
    expect(store.currentProject?.slug).toBe("demo");
    expect(store.openWorkspaceProjects.map((item) => item.slug)).toEqual(["demo"]);
    expect(store.currentChapter?.id).toBe("chapter-002");
  });

  it("returns to the project hub and can close an open workspace", async () => {
    const store = useNovelStore();
    store.projects = [project];
    await store.openProject(project);

    store.showProjectHub();

    expect(store.currentProject).toBeNull();
    expect(store.openWorkspaceProjects.map((item) => item.slug)).toEqual(["demo"]);

    await store.closeWorkspace("demo");

    expect(store.openWorkspaceProjects).toEqual([]);
  });

  it("tracks dirty content and marks it clean after saving", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);

    store.updateContent("manual edit");
    expect(store.hasUnsavedChanges).toBe(true);

    await store.saveCurrentContent();

    expect(mockNovelApi.saveFile).toHaveBeenCalledWith("demo", "chapters/chapter-001.md", "manual edit");
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("keeps the dashboard word count synchronized with draft saves", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);

    store.updateContent("abc def");
    expect(store.currentDashboard?.wordCount).toBe(6);

    await store.saveCurrentContent();

    expect(mockNovelApi.saveChapterDashboard).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({
        chapterId: "chapter-001",
        wordCount: 6
      })
    );
  });

  it("loads and saves ledger entries for the selected project", async () => {
    const entries: LedgerEntry[] = [
      {
        id: "risk-1",
        kind: "risk",
        title: "Information boundary",
        status: "open",
        severity: "medium",
        chapterIds: ["chapter-001"],
        relatedEntities: ["Hero"],
        note: "Avoid omniscient labels.",
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    ];
    mockNovelApi.readLedgerEntries.mockResolvedValueOnce(entries);
    const store = useNovelStore();
    store.currentProject = project;

    await store.loadLedger("risk");
    expect(store.activeLedgerKind).toBe("risk");
    expect(store.ledgerEntries).toEqual(entries);

    await store.saveLedger("risk", entries);
    expect(mockNovelApi.saveLedgerEntries).toHaveBeenCalledWith("demo", "risk", entries);
  });

  it("saves support files independently from chapter content", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openSupportFile("bible/world.md");

    store.updateSupportContent("world notes");
    expect(store.hasUnsavedSupportChanges).toBe(true);

    await store.saveSupportContent();

    expect(mockNovelApi.saveFile).toHaveBeenCalledWith("demo", "bible/world.md", "world notes");
    expect(store.hasUnsavedSupportChanges).toBe(false);
  });

  it("runs an AI task with current chapter context and stores the result", async () => {
    mockNovelApi.runTask.mockResolvedValue(taskWithResult());
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[1];
    store.currentFilePath = project.chapters[1].contentPath;

    await store.runTask("idea.suggest", { feedback: "Need a smaller turn." });

    expect(mockNovelApi.runTask).toHaveBeenCalledWith(
      "demo",
      "idea.suggest",
      expect.objectContaining({
        chapterId: "chapter-002",
        filePath: "chapters/chapter-002.md",
        feedback: "Need a smaller turn."
      })
    );
    expect(store.currentTask?.id).toBe("task-1");
    expect(store.taskHistory).toHaveLength(1);
    expect(store.rewriteCandidate?.summary).toBe("Generated ideas");
    expect(store.taskProgress.every((step) => step.status === "done")).toBe(true);
  });

  it("requests a writing recap candidate and keeps it out of rewrite flow", async () => {
    const recap: WritingRecapCandidate = {
      chapterId: "chapter-002",
      summary: "The clue now has a cost.",
      newFacts: ["Blood wakes the mark."],
      characterStateChanges: ["Hero distrusts the gate."],
      foreshadowingUpdates: [],
      continuityRisks: [
        {
          id: "risk-1",
          kind: "risk",
          title: "POV boundary",
          status: "open",
          severity: "high",
          chapterIds: ["chapter-002"],
          relatedEntities: ["Hero"],
          note: "Avoid knowledge outside the hero's senses.",
          updatedAt: "2026-06-04T00:00:00.000Z"
        }
      ],
      powerProgressionUpdates: [],
      createdAt: "2026-06-04T00:00:00.000Z"
    };
    mockNovelApi.runTask.mockResolvedValue(
      taskWithResult({
        type: "writing.recap",
        result: {
          summary: "Recap candidate",
          content: JSON.stringify(recap),
          changes: [],
          risks: [],
          questions: [],
          patches: []
        }
      })
    );
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[1];
    store.currentFilePath = project.chapters[1].contentPath;

    await store.requestWritingRecap();

    expect(mockNovelApi.runTask).toHaveBeenCalledWith(
      "demo",
      "writing.recap",
      expect.objectContaining({
        chapterId: "chapter-002",
        filePath: "chapters/chapter-002.md"
      })
    );
    expect(store.recapCandidate?.summary).toBe("The clue now has a cost.");
    expect(store.rewriteCandidate).toBeNull();
  });

  it("accepts recap ledger updates only after author confirmation", async () => {
    const update: LedgerEntry = {
      id: "risk-1",
      kind: "risk",
      title: "POV boundary",
      status: "open",
      severity: "high",
      chapterIds: ["chapter-002"],
      relatedEntities: ["Hero"],
      note: "Avoid knowledge outside the hero's senses.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const store = useNovelStore();
    store.currentProject = project;
    store.activeLedgerKind = "risk";
    store.ledgerEntries = [];
    store.recapCandidate = {
      chapterId: "chapter-002",
      summary: "The clue now has a cost.",
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [update],
      powerProgressionUpdates: [],
      createdAt: "2026-06-04T00:00:00.000Z"
    };

    await store.acceptWritingRecap();

    expect(mockNovelApi.saveLedgerEntries).toHaveBeenCalledWith("demo", "risk", [update]);
    expect(store.ledgerEntries).toEqual([update]);
    expect(store.recapCandidate).toBeNull();
  });

  it("routes chapter planning to the outline document before calling AI", async () => {
    mockNovelApi.runTask.mockResolvedValue(taskWithResult({ type: "chapter.plan" }));
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);

    await store.runTask("chapter.plan");

    expect(store.currentDocumentKind).toBe("outline");
    expect(mockNovelApi.runTask).toHaveBeenCalledWith(
      "demo",
      "chapter.plan",
      expect.objectContaining({
        chapterId: "chapter-001",
        documentKind: "outline",
        filePath: "outline/chapter-001.md"
      })
    );
  });

  it("runs an ad-hoc AI task with the author instruction", async () => {
    mockNovelApi.runTask.mockResolvedValue(taskWithResult({ type: "assistant.free" }));
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[1];
    store.currentFilePath = project.chapters[1].contentPath;

    await store.runTask("assistant.free", { instruction: "检查这一章的升级节奏。" });

    expect(mockNovelApi.runTask).toHaveBeenCalledWith(
      "demo",
      "assistant.free",
      expect.objectContaining({
        chapterId: "chapter-002",
        instruction: "检查这一章的升级节奏。"
      })
    );
    expect(store.currentTask?.type).toBe("assistant.free");
  });

  it("captures task errors without leaving the store in loading state", async () => {
    mockNovelApi.runTask.mockRejectedValue(new Error("Codex unavailable"));
    const store = useNovelStore();
    store.currentProject = project;

    await expect(store.runTask("outline.generate")).rejects.toThrow("Codex unavailable");

    expect(store.error).toBe("Codex unavailable");
    expect(store.isLoading).toBe(false);
    expect(store.taskProgress.some((step) => step.status === "error")).toBe(true);
  });

  it("polishes the selected range only after a selection exists", async () => {
    mockNovelApi.polishSelection.mockResolvedValue(
      taskWithResult({
        type: "selection.polish",
        result: {
          summary: "Polished",
          content: "a sharper line",
          changes: [],
          risks: [],
          questions: [],
          patches: []
        }
      })
    );
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[0];
    store.selection = {
      filePath: "chapters/chapter-001.md",
      selectedText: "plain line",
      beforeText: "",
      afterText: "",
      start: 0,
      end: 10
    };

    await store.polishSelection("polish");

    expect(mockNovelApi.polishSelection).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ chapterId: "chapter-001", mode: "polish", selectedText: "plain line" })
    );
    expect(store.rewriteCandidate?.content).toBe("a sharper line");
  });

  it("accepts a rewrite by replacing only the original selection", () => {
    const store = useNovelStore();
    store.currentContent = "before plain line after";
    store.selection = {
      filePath: "chapters/chapter-001.md",
      selectedText: "plain line",
      beforeText: "before ",
      afterText: " after",
      start: 7,
      end: 17
    };
    store.rewriteCandidate = {
      summary: "Polished",
      content: "a sharper line",
      changes: [],
      risks: [],
      questions: [],
      patches: []
    };

    store.acceptRewrite();

    expect(store.currentContent).toBe("before a sharper line after");
    expect(store.selection).toBeNull();
    expect(store.rewriteCandidate).toBeNull();
  });

  it("does not accept a selected rewrite when the original selection is gone", () => {
    const store = useNovelStore();
    store.currentContent = "before plain line after";
    store.selection = null;
    store.rewriteCandidate = {
      summary: "Polished",
      content: "a sharper line",
      changes: [],
      risks: [],
      questions: [],
      patches: []
    };

    store.acceptRewrite();

    expect(store.currentContent).toBe("before plain line after");
    expect(store.rewriteCandidate?.content).toBe("a sharper line");
  });

  it("rejects a rewrite without mutating the draft", () => {
    const store = useNovelStore();
    store.currentContent = "before plain line after";
    store.selection = {
      filePath: "chapters/chapter-001.md",
      selectedText: "plain line",
      beforeText: "before ",
      afterText: " after",
      start: 7,
      end: 17
    };
    store.rewriteCandidate = {
      summary: "Polished",
      content: "a sharper line",
      changes: [],
      risks: [],
      questions: [],
      patches: []
    };

    store.rejectRewrite();

    expect(store.currentContent).toBe("before plain line after");
    expect(store.rewriteCandidate).toBeNull();
  });

  it("applies generated patches and reloads the current chapter", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[0];
    store.rewriteCandidate = {
      summary: "Patch",
      content: "",
      changes: [],
      risks: [],
      questions: [],
      patches: [{ target: "chapters/chapter-001.md", mode: "replace-file", content: "accepted" }]
    };

    await store.applyTaskPatches();

    expect(mockNovelApi.applyPatches).toHaveBeenCalledWith("demo", [
      { target: "chapters/chapter-001.md", mode: "replace-file", content: "accepted" }
    ]);
    expect(mockNovelApi.readFile).toHaveBeenCalledWith("demo", "chapters/chapter-001.md");
    expect(store.currentContent).toBe("draft:chapters/chapter-001.md");
  });
});
