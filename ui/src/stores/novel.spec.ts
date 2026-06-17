import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNovelStore } from "./novel";
import type {
  AiInvocationSession,
  AiStageDefinition,
  BackgroundJob,
  ChapterDashboard,
  ChapterFactPatch,
  ChapterQualityReport,
  ChapterSummary,
  CharacterStatePatch,
  LedgerEntry,
  NovelProject,
  NovelTask,
  ProjectAuditReport,
  SceneCard,
  StoryControl,
  WritingBriefing,
  WritingRecapCandidate
} from "@/types/novel";

const mockNovelApi = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  importProject: vi.fn(),
  readPlatformLibrary: vi.fn(),
  readAiStages: vi.fn(),
  createPlatformAsset: vi.fn(),
  linkPlatformAsset: vi.fn(),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  readChapterDashboard: vi.fn(),
  readCreationRuntimeSnapshot: vi.fn(),
  saveChapterDashboard: vi.fn(),
  readSceneCards: vi.fn(),
  saveSceneCards: vi.fn(),
  readChapterSummary: vi.fn(),
  saveChapterSummary: vi.fn(),
  readChapterQualityReport: vi.fn(),
  readSeriesQualityMetrics: vi.fn(),
  saveChapterQualityReport: vi.fn(),
  readStoryControl: vi.fn(),
  saveStoryControl: vi.fn(),
  readStoryGraph: vi.fn(),
  readKnowledgeIndex: vi.fn(),
  rebuildKnowledgeIndex: vi.fn(),
  listBackgroundJobs: vi.fn(),
  startBackgroundJob: vi.fn(),
  readBackgroundJob: vi.fn(),
  cancelBackgroundJob: vi.fn(),
  retryBackgroundJob: vi.fn(),
  searchKnowledgeIndex: vi.fn(),
  readLedgerEntries: vi.fn(),
  saveLedgerEntries: vi.fn(),
  acceptWritingRecap: vi.fn(),
  readAiInvocations: vi.fn(),
  readProjectAuditReport: vi.fn(),
  readFileVersions: vi.fn(),
  readFileDiff: vi.fn(),
  requestEditorSuggestion: vi.fn(),
  runTask: vi.fn(),
  listTasks: vi.fn(),
  startTask: vi.fn(),
  readTask: vi.fn(),
  cancelTask: vi.fn(),
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

const aiStages: AiStageDefinition[] = [
  { key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] },
  { key: "autopilot.post_chapter.recap", label: "Post-chapter recap", taskTypes: ["writing.recap"] }
];

const storyControl: StoryControl = {
  version: 1,
  premise: "A careful hero opens a sealed gate.",
  currentArcId: "arc-1",
  arcs: [
    {
      id: "arc-1",
      title: "Opening pressure",
      chapterRange: "1-5",
      goal: "Make the first choice costly.",
      stakes: "The hero loses shelter if he hesitates.",
      payoff: "A credible first breakthrough.",
      status: "planned",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  characters: [
    {
      id: "char-hero",
      name: "Hero",
      role: "Protagonist",
      goal: "Survive the gate.",
      currentState: "Cautious.",
      knownSecrets: "Only what he has witnessed.",
      relationshipNotes: "No team yet.",
      powerLevel: "Novice",
      status: "active",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  events: [
    {
      id: "event-gate",
      type: "dungeon",
      title: "Sealed gate",
      trigger: "The clue answers blood.",
      participants: ["Hero"],
      location: "Old gate",
      conflict: "Inspect or flee.",
      reward: "A small technique clue.",
      cost: "A watcher notices him.",
      foreshadowing: "A broken seal mark.",
      chapterRange: "2-4",
      status: "planned",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  orchestrationNotes: "Keep upgrades causal.",
  updatedAt: "2026-06-04T00:00:00.000Z"
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

function invocationForTask(taskId = "task-1"): AiInvocationSession {
  return {
    id: "invocation-1",
    taskId,
    projectId: "demo",
    taskType: "idea.suggest",
    stageKey: "pipeline.idea.suggest",
    status: "success",
    agentProfileId: "codex-cli",
    agentProvider: "codex",
    modelId: "gpt-5",
    promptSnapshot: { length: 1200, preview: "prompt", contextTitles: ["Project"] },
    contextSnapshot: { blockCount: 1, totalChars: 80, blocks: [{ title: "Project", length: 80 }] },
    attempt: { index: 1, startedAt: "2026-06-03T00:00:00.000Z", durationMs: 12, exitCode: 0 },
    adoptionDecision: "not-required",
    proposedPatchTargets: [],
    acceptedPatchTargets: [],
    commitResult: { historyAppended: true, invocationAppended: true },
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z"
  };
}

function backgroundJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: "job-knowledge-1",
    projectId: "demo",
    type: "knowledge.index.rebuild",
    status: "success",
    inputSummary: "{}",
    outputSummary: "1 facts / 0 relations",
    resultRef: "/api/novel/projects/demo/knowledge/index",
    startedAt: "2026-06-11T00:00:00.000Z",
    finishedAt: "2026-06-11T00:00:01.000Z",
    durationMs: 1000,
    updatedAt: "2026-06-11T00:00:01.000Z",
    ...overrides
  };
}

function auditReport(overrides: Partial<ProjectAuditReport> = {}): ProjectAuditReport {
  return {
    projectSlug: "demo",
    projectTitle: "Demo Novel",
    generatedAt: "2026-06-11T00:00:00.000Z",
    chapters: [
      {
        id: "chapter-001",
        title: "Chapter 1",
        status: "drafted",
        contentPath: "chapters/chapter-001.md",
        outlinePath: "outline/chapter-001.md"
      }
    ],
    quality: {
      projectSlug: "demo",
      chapterCount: 1,
      reportCount: 1,
      averageOverallScore: 82,
      metricAverages: [],
      weakestChapters: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    taskSummary: {
      total: 1,
      byStatus: { pending: 0, running: 0, success: 1, error: 0, cancelled: 0 },
      byType: { "chapter.draft": 1 },
      latestTasks: []
    },
    aiInvocationSummary: {
      total: 1,
      byDecision: { pending: 0, accepted: 1, rejected: 0, "not-required": 0 },
      proposedPatchCount: 1,
      acceptedPatchCount: 1,
      promptVersions: {},
      preCallWarnings: {},
      contextTierTotals: {},
      truncatedContextBlocks: []
    },
    knowledgeSummary: {
      factCount: 2,
      tripleCount: 1,
      indexedChapterCount: 1,
      keywordCount: 3,
      vectorSummary: {
        provider: "local",
        dimensions: 16,
        entryCount: 4,
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    },
    runtimeSummary: {
      chapterCount: 1,
      byActiveStep: { structure: 0, draft: 0, review: 1, recap: 0, ledger: 0, next: 0, none: 0 },
      blockedStepCount: 0,
      snapshots: []
    },
    backgroundJobSummary: {
      total: 1,
      byStatus: { pending: 0, running: 0, success: 1, error: 0 },
      latestJobs: [backgroundJob()]
    },
    aiInvocations: [invocationForTask()],
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("novel writing memory contracts", () => {
  it("supports chapter summary and recap patch types", () => {
    const ledgerEntry: LedgerEntry = {
      id: "risk-1",
      kind: "risk",
      title: "POV may know too much",
      status: "watch",
      severity: "high",
      chapterIds: ["chapter-001"],
      relatedEntities: ["Hero"],
      note: "Keep hidden lore out of narration.",
      updatedAt: "2026-06-04T00:00:00.000Z"
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
      characterId: "char-hero",
      characterName: "Hero",
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
      summary: "The hero paid blood to test the sealed gate.",
      keyEvents: ["The gate answered blood."],
      newFacts: [factPatch],
      characterStateChanges: [characterPatch],
      foreshadowingUpdates: [],
      continuityRisks: [ledgerEntry],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const recap: WritingRecapCandidate = {
      chapterId: "chapter-001",
      summary: chapterSummary.summary,
      newFacts: [factPatch.fact],
      characterStateChanges: [characterPatch.after],
      foreshadowingUpdates: [],
      continuityRisks: [ledgerEntry],
      powerProgressionUpdates: [],
      createdAt: "2026-06-04T00:00:00.000Z",
      summaryPatch: { summary: chapterSummary.summary, keyEvents: chapterSummary.keyEvents },
      factPatches: [factPatch],
      ledgerPatches: [ledgerEntry],
      characterStatePatches: [characterPatch],
      riskPatches: [ledgerEntry]
    };

    expect(chapterSummary.newFacts[0].status).toBe("pending");
    expect(recap.characterStatePatches?.[0].characterName).toBe("Hero");
  });
});

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
    mockNovelApi.readCreationRuntimeSnapshot.mockImplementation(async (_projectId: string, chapterId: string) => ({
      projectSlug: "demo",
      chapterId,
      chapterTitle: "Chapter",
      activeStepId: "review",
      fingerprint: "abcdef1234567890",
      steps: [],
      signals: {
        wordCount: 120,
        sceneCount: 0,
        hasDashboard: true,
        hasChapterSummary: false,
        hasQualityReport: false,
        hasWritingRecap: false,
        acceptedLedgerCount: 0
      },
      updatedAt: "2026-06-11T00:00:00.000Z"
    }));
    mockNovelApi.saveChapterDashboard.mockImplementation(async (_projectId: string, dashboard: ChapterDashboard) => dashboard);
    mockNovelApi.readSceneCards.mockResolvedValue([]);
    mockNovelApi.saveSceneCards.mockImplementation(async (_projectId: string, _chapterId: string, cards: SceneCard[]) => cards);
    mockNovelApi.readChapterSummary.mockImplementation(async (_projectId: string, chapterId: string) => ({
      chapterId,
      summary: "",
      keyEvents: [],
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    }));
    mockNovelApi.saveChapterSummary.mockImplementation(async (_projectId: string, _chapterId: string, summary: ChapterSummary) => summary);
    mockNovelApi.readChapterQualityReport.mockResolvedValue(null);
    mockNovelApi.readSeriesQualityMetrics.mockResolvedValue({
      projectSlug: "demo",
      chapterCount: 2,
      reportCount: 0,
      averageOverallScore: 0,
      metricAverages: [],
      weakestChapters: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    mockNovelApi.saveChapterQualityReport.mockImplementation(async (_projectId: string, report: ChapterQualityReport) => ({
      report,
      seriesMetrics: {
        projectSlug: "demo",
        chapterCount: 2,
        reportCount: 1,
        averageOverallScore: report.overallScore,
        metricAverages: report.metrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          averageScore: metric.score,
          reportCount: 1
        })),
        weakestChapters: [
          {
            chapterId: report.chapterId,
            chapterTitle: "Chapter",
            overallScore: report.overallScore,
            weakestMetricKey: report.metrics[0]?.key,
            weakestMetricLabel: report.metrics[0]?.label,
            weakestMetricScore: report.metrics[0]?.score,
            updatedAt: report.updatedAt
          }
        ],
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    }));
    mockNovelApi.readStoryControl.mockResolvedValue(storyControl);
    mockNovelApi.saveStoryControl.mockImplementation(async (_projectId: string, control: StoryControl) => control);
    mockNovelApi.readStoryGraph.mockResolvedValue({
      projectSlug: "demo",
      nodes: [{ id: "chapter:chapter-001", type: "chapter", label: "Chapter 1" }],
      edges: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    mockNovelApi.readKnowledgeIndex.mockResolvedValue({
      projectSlug: "demo",
      facts: [{ id: "fact:gate", text: "The gate opens.", chapterIds: ["chapter-001"], relatedEntities: ["Hero"], keywords: ["gate"], source: { type: "chapter-summary", id: "fact-1" }, updatedAt: "2026-06-11T00:00:00.000Z" }],
      triples: [],
      chapterIndex: {
        projectSlug: "demo",
        chapters: [{ chapterId: "chapter-001", title: "Chapter 1", keywords: ["gate"], factIds: ["fact:gate"], tripleIds: [], entityNames: ["Hero"], updatedAt: "2026-06-11T00:00:00.000Z" }],
        keywords: { gate: ["chapter-001"] },
        updatedAt: "2026-06-11T00:00:00.000Z"
      },
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    mockNovelApi.rebuildKnowledgeIndex.mockImplementation(async () => mockNovelApi.readKnowledgeIndex());
    mockNovelApi.listBackgroundJobs.mockResolvedValue([]);
    mockNovelApi.startBackgroundJob.mockResolvedValue(
      backgroundJob({
        status: "running",
        outputSummary: undefined,
        resultRef: undefined,
        finishedAt: undefined,
        durationMs: undefined,
        updatedAt: "2026-06-11T00:00:00.000Z"
      })
    );
    mockNovelApi.readBackgroundJob.mockResolvedValue(backgroundJob());
    mockNovelApi.cancelBackgroundJob.mockResolvedValue(backgroundJob({ status: "cancelled" }));
    mockNovelApi.retryBackgroundJob.mockResolvedValue(backgroundJob({ id: "job-retry-1", status: "running", retryOf: "job-knowledge-1" }));
    mockNovelApi.searchKnowledgeIndex.mockResolvedValue({
      query: "Hero gate",
      tokens: ["hero", "gate"],
      facts: [
        {
          id: "fact:gate",
          text: "The gate opens.",
          chapterIds: ["chapter-001"],
          relatedEntities: ["Hero"],
          keywords: ["gate"],
          source: { type: "chapter-summary", id: "fact-1" },
          updatedAt: "2026-06-11T00:00:00.000Z",
          score: 2
        }
      ],
      triples: [],
      chapters: [
        {
          chapterId: "chapter-001",
          title: "Chapter 1",
          keywords: ["gate"],
          factIds: ["fact:gate"],
          tripleIds: [],
          entityNames: ["Hero"],
          updatedAt: "2026-06-11T00:00:00.000Z",
          score: 2
        }
      ]
    });
    mockNovelApi.readLedgerEntries.mockResolvedValue([]);
    mockNovelApi.saveLedgerEntries.mockImplementation(async (_projectId: string, _kind: LedgerEntry["kind"], entries: LedgerEntry[]) => entries);
    mockNovelApi.acceptWritingRecap.mockImplementation(async (_projectId: string, recap: WritingRecapCandidate) => ({
      summary: {
        chapterId: recap.chapterId,
        summary: recap.summary,
        keyEvents: [],
        newFacts: recap.factPatches || [],
        characterStateChanges: recap.characterStatePatches || [],
        foreshadowingUpdates: recap.foreshadowingUpdates,
        continuityRisks: recap.continuityRisks,
        powerProgressionUpdates: recap.powerProgressionUpdates,
        acceptedRecapIds: [recap.createdAt],
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    }));
    mockNovelApi.readAiInvocations.mockResolvedValue([]);
    mockNovelApi.readProjectAuditReport.mockResolvedValue(auditReport());
    mockNovelApi.readFileVersions.mockResolvedValue([]);
    mockNovelApi.readFileDiff.mockResolvedValue({
      filePath: "chapters/chapter-001.md",
      fromVersion: {
        id: "version-1",
        filePath: "chapters/chapter-001.md",
        versionPath: "versions/chapters__chapter-001.md/version-1.md",
        createdAt: "2026-06-12T00:00:00.000Z",
        size: 12
      },
      toVersion: { id: "current", label: "current", createdAt: "2026-06-12T00:01:00.000Z" },
      original: "old draft",
      modified: "new draft"
    });
    mockNovelApi.requestEditorSuggestion.mockResolvedValue({
      id: "suggestion-1",
      text: " next line",
      summary: "local",
      source: "local",
      createdAt: "2026-06-12T00:00:00.000Z"
    });
    mockNovelApi.listTasks.mockResolvedValue([]);
    mockNovelApi.startTask.mockResolvedValue(
      taskWithResult({
        status: "running",
        result: undefined,
        outputSummary: undefined,
        finishedAt: undefined,
        durationMs: undefined,
        timeoutMs: 60_000
      })
    );
    mockNovelApi.readTask.mockResolvedValue(taskWithResult());
    mockNovelApi.cancelTask.mockResolvedValue(taskWithResult({ status: "cancelled", error: "cancelled" }));
    mockNovelApi.applyPatches.mockResolvedValue(undefined);
    mockNovelApi.readPlatformLibrary.mockResolvedValue(platformLibrary);
    mockNovelApi.readAiStages.mockResolvedValue(aiStages);
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
    mockNovelApi.readChapterQualityReport.mockResolvedValueOnce({
      chapterId: "chapter-002",
      overallScore: 78,
      summary: "Saved report.",
      metrics: [],
      strengths: [],
      fixes: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });

    const store = useNovelStore();
    store.projects = [project];
    await store.openProject(project);

    expect(mockNovelApi.readChapterDashboard).toHaveBeenCalledWith("demo", "chapter-002");
    expect(mockNovelApi.readSceneCards).toHaveBeenCalledWith("demo", "chapter-002");
    expect(mockNovelApi.readChapterSummary).toHaveBeenCalledWith("demo", "chapter-002");
    expect(mockNovelApi.readChapterQualityReport).toHaveBeenCalledWith("demo", "chapter-002");
    expect(mockNovelApi.readCreationRuntimeSnapshot).toHaveBeenCalledWith("demo", "chapter-002");
    expect(mockNovelApi.readSeriesQualityMetrics).toHaveBeenCalledWith("demo");
    expect(mockNovelApi.readStoryGraph).toHaveBeenCalledWith("demo");
    expect(mockNovelApi.readKnowledgeIndex).toHaveBeenCalledWith("demo");
    expect(mockNovelApi.readLedgerEntries).toHaveBeenCalledWith("demo", "foreshadowing");
    expect(mockNovelApi.listBackgroundJobs).toHaveBeenCalledWith("demo");
    expect(store.currentDashboard?.chapterId).toBe("chapter-002");
    expect(store.currentChapterSummary?.chapterId).toBe("chapter-002");
    expect(store.currentRuntimeSnapshot?.chapterId).toBe("chapter-002");
    expect(store.currentSeriesQualityMetrics?.projectSlug).toBe("demo");
    expect(store.currentQualityReport?.overallScore).toBe(78);
    expect(store.storyGraph?.nodes).toEqual([expect.objectContaining({ type: "chapter" })]);
    expect(store.knowledgeIndex?.facts).toEqual([expect.objectContaining({ id: "fact:gate" })]);
    expect(store.sceneCards).toEqual(scenes);
    expect(store.activeLedgerKind).toBe("foreshadowing");
  });

  it("loads shared AI stage definitions", async () => {
    const store = useNovelStore();

    await store.loadAiStages();

    expect(mockNovelApi.readAiStages).toHaveBeenCalled();
    expect(store.aiStages).toEqual(aiStages);
  });

  it("searches the knowledge index for the active chapter", async () => {
    const store = useNovelStore();
    store.projects = [project];
    await store.openProject(project);

    const result = await store.searchKnowledgeIndex(" Hero gate ");

    expect(mockNovelApi.searchKnowledgeIndex).toHaveBeenCalledWith("demo", {
      query: "Hero gate",
      chapterId: "chapter-002",
      limit: 12
    });
    expect(result?.facts).toEqual([expect.objectContaining({ id: "fact:gate", score: 2 })]);
    expect(store.knowledgeSearchResult?.chapters[0]).toEqual(expect.objectContaining({ chapterId: "chapter-001" }));

    await expect(store.searchKnowledgeIndex("   ")).resolves.toBeNull();
    expect(store.knowledgeSearchResult).toBeNull();
  });

  it("loads project background jobs", async () => {
    mockNovelApi.listBackgroundJobs.mockResolvedValueOnce([backgroundJob()]);
    const store = useNovelStore();
    store.currentProject = project;

    await store.loadBackgroundJobs();

    expect(mockNovelApi.listBackgroundJobs).toHaveBeenCalledWith("demo");
    expect(store.backgroundJobs).toEqual([expect.objectContaining({ id: "job-knowledge-1", status: "success" })]);
  });

  it("cancels and retries project background jobs", async () => {
    const cancelled = backgroundJob({ id: "job-running-1", status: "cancelled" });
    const retried = backgroundJob({ id: "job-retry-1", status: "running", retryOf: "job-failed-1" });
    const retryFinished = backgroundJob({ id: "job-retry-1", status: "success", retryOf: "job-failed-1", outputSummary: "retried" });
    mockNovelApi.cancelBackgroundJob.mockResolvedValueOnce(cancelled);
    mockNovelApi.retryBackgroundJob.mockResolvedValueOnce(retried);
    mockNovelApi.readBackgroundJob.mockResolvedValueOnce(retryFinished);
    const store = useNovelStore();
    store.currentProject = project;

    await store.cancelBackgroundJob("job-running-1");
    await store.retryBackgroundJob("job-failed-1");

    expect(mockNovelApi.cancelBackgroundJob).toHaveBeenCalledWith("demo", "job-running-1");
    expect(mockNovelApi.retryBackgroundJob).toHaveBeenCalledWith("demo", "job-failed-1");
    expect(mockNovelApi.readBackgroundJob).toHaveBeenCalledWith("demo", "job-retry-1");
    expect(store.backgroundJobs).toEqual([
      expect.objectContaining({ id: "job-retry-1", status: "success", retryOf: "job-failed-1" }),
      expect.objectContaining({ id: "job-running-1", status: "cancelled" })
    ]);
  });

  it("previews a project audit report in the workspace", async () => {
    const report = auditReport({ projectTitle: "Preview Demo" });
    mockNovelApi.readProjectAuditReport.mockResolvedValueOnce(report);
    const store = useNovelStore();
    store.currentProject = project;

    const result = await store.previewProjectAuditReport();

    expect(mockNovelApi.readProjectAuditReport).toHaveBeenCalledWith("demo");
    expect(result).toEqual(report);
    expect(store.auditReportPreview).toEqual(report);
    expect(store.isLoadingAuditReportPreview).toBe(false);

    store.clearAuditReportPreview();
    expect(store.auditReportPreview).toBeNull();
  });

  it("loads, saves, and requests story-level orchestration", async () => {
    mockNovelApi.readTask.mockResolvedValue(taskWithResult());
    const store = useNovelStore();
    store.projects = [project];

    await store.openProject(project);

    expect(mockNovelApi.readStoryControl).toHaveBeenCalledWith("demo");
    expect(store.storyControl?.premise).toBe("A careful hero opens a sealed gate.");

    store.updateStoryControl({ premise: "Updated whole-novel premise." });
    await store.saveStoryControl();

    expect(mockNovelApi.saveStoryControl).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ premise: "Updated whole-novel premise." })
    );
    expect(mockNovelApi.readKnowledgeIndex).toHaveBeenCalledWith("demo");

    await store.requestStoryOrchestration();

    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
      "demo",
      "idea.suggest",
      expect.objectContaining({
        mode: "story-control.orchestrate",
        storyControl: expect.objectContaining({ premise: "Updated whole-novel premise." })
      })
    );
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
    store.updateFocusDraftInstruction("保留这个项目的专注写作指令。");
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
    expect(store.focusDraftInstruction).toBe("保留这个项目的专注写作指令。");
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

  it("loads file snapshots, previews diffs, and asks for editor suggestions with chapter context", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    const version = {
      id: "version-2",
      filePath: "chapters/chapter-001.md",
      versionPath: "versions/chapters__chapter-001.md/version-2.md",
      createdAt: "2026-06-12T00:00:00.000Z",
      size: 42
    };
    mockNovelApi.readFileVersions.mockResolvedValueOnce([version]);

    await expect(store.loadCurrentFileVersions()).resolves.toEqual([version]);
    await expect(store.previewCurrentFileDiff("version-2")).resolves.toMatchObject({
      filePath: "chapters/chapter-001.md",
      original: "old draft",
      modified: "new draft"
    });
    await expect(
      store.requestEditorSuggestion({
        filePath: "ignored.md",
        chapterId: "ignored",
        documentKind: "outline",
        beforeText: "The gate opens",
        afterText: ""
      })
    ).resolves.toMatchObject({ id: "suggestion-1", text: " next line" });

    expect(mockNovelApi.readFileVersions).toHaveBeenCalledWith("demo", "chapters/chapter-001.md");
    expect(mockNovelApi.readFileDiff).toHaveBeenCalledWith("demo", "chapters/chapter-001.md", "version-2");
    expect(mockNovelApi.requestEditorSuggestion).toHaveBeenCalledWith("demo", {
      filePath: "chapters/chapter-001.md",
      chapterId: "chapter-001",
      documentKind: "content",
      beforeText: "The gate opens",
      afterText: ""
    });
  });

  it("builds chapter creation loop steps from structure, draft, review, and recap state", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);

    store.updateDashboard({ goal: "让主角带着代价发现线索。" });
    store.updateContent("他在雨夜发现封印，却不能靠近。风声很冷，血落在石阶上。门后突然传来回应，他必须选择是否暴露身份。");

    expect(store.creationLoopSteps.find((step) => step.id === "structure")).toMatchObject({
      status: "done",
      action: "open-structure"
    });
    expect(store.creationLoopSteps.find((step) => step.id === "draft")).toMatchObject({
      status: "active",
      action: "save-draft",
      signals: expect.arrayContaining(["正文未保存"])
    });
    expect(store.creationLoopSteps.find((step) => step.id === "review")).toMatchObject({
      status: "blocked"
    });

    await store.runCreationLoopAction("save-draft");

    expect(store.creationLoopSteps.find((step) => step.id === "draft")).toMatchObject({
      status: "done",
      action: "open-focus"
    });
    expect(store.creationLoopSteps.find((step) => step.id === "review")).toMatchObject({
      status: "waiting",
      action: "diagnose"
    });
    expect(store.creationLoopSteps.find((step) => step.id === "recap")).toMatchObject({
      status: "waiting",
      action: "request-recap"
    });

    store.recapCandidate = {
      chapterId: "chapter-001",
      summary: "血回应了封印。",
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      emotionLedgerPatch: {
        wounds: [
          {
            id: "emotion-wound-1",
            chapterId: "chapter-001",
            characterName: "主角",
            description: "他知道求生会继续流血。",
            status: "open",
            relatedEntities: ["封印"],
            updatedAt: "2026-06-12T00:00:00.000Z"
          }
        ],
        openLoops: [
          {
            id: "emotion-loop-1",
            chapterId: "chapter-001",
            characterName: "主角",
            description: "血债何时回收仍未解决。",
            status: "open",
            relatedEntities: ["血债"],
            updatedAt: "2026-06-12T00:00:00.000Z"
          }
        ]
      },
      createdAt: "2026-06-12T00:00:00.000Z"
    };

    expect(store.creationLoopSteps.find((step) => step.id === "recap")).toMatchObject({
      status: "active",
      signals: expect.arrayContaining(["情绪待入账 2"])
    });
    expect(store.creationLoopSteps.find((step) => step.id === "ledger")).toMatchObject({
      metric: "情绪 2",
      signals: expect.arrayContaining(["情绪待入账 2"])
    });
  });

  it("ranks next workbench actions and aggregates first-screen risk signals", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);

    store.updateContent("他在雨夜发现封印，却不能靠近。风声很冷，血落在石阶上。门后突然传来回应，他必须选择是否暴露身份。");

    expect(store.nextWorkbenchActions[0]).toMatchObject({
      id: "save-draft",
      priority: "critical",
      action: "save-draft"
    });
    expect(store.workbenchRiskSignals.find((signal) => signal.id === "draft-save")).toMatchObject({
      status: "blocked",
      action: "save-draft",
      detailRows: expect.arrayContaining([expect.objectContaining({ id: "draft-state" })])
    });

    await store.runCreationLoopAction("save-draft");
    store.currentRuntimeSnapshot = {
      ...store.currentRuntimeSnapshot!,
      signals: {
        ...store.currentRuntimeSnapshot!.signals,
        narrativeDebt: {
          debtCount: 4,
          openForeshadowingCount: 2,
          riskCount: 1,
          openLoopCount: 1,
          overdueCount: 1,
          severity: "blocked"
        }
      }
    };

    expect(store.nextWorkbenchActions[0]).toMatchObject({
      id: "narrative-debt",
      priority: "critical",
      action: "open-review"
    });
    expect(store.workbenchRiskSignals.find((signal) => signal.id === "narrative-debt")).toMatchObject({
      status: "blocked",
      action: "open-review",
      detailRows: expect.arrayContaining([expect.objectContaining({ id: "open-foreshadowing" })])
    });
  });

  it("summarizes PlotPilot learning items from available workspace evidence", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.aiInvocations = [
      {
        ...invocationForTask(),
        promptVersion: "chapter-draft:v2",
        preCallReview: {
          status: "warn",
          warnings: ["context compressed"],
          reviewedAt: "2026-06-12T00:00:00.000Z"
        },
        contextSnapshot: {
          blockCount: 3,
          totalChars: 1200,
          tierCounts: { T0: 1, T1: 1, T2: 1 },
          truncatedBlocks: ["long draft"],
          blocks: [
            { title: "Promise", length: 200, tier: "T0" },
            { title: "Ledger", length: 400, tier: "T1" },
            { title: "Draft", length: 600, tier: "T2", truncated: true }
          ]
        }
      }
    ];
    store.storyGraph = {
      projectSlug: "demo",
      nodes: [{ id: "knowledge:gate", type: "knowledge", label: "Gate" }],
      edges: [],
      characterRelations: {
        characters: [{ id: "char-shadow", type: "character", label: "Shadow" }],
        relationships: [],
        coverage: [],
        appearanceSignals: [
          {
            characterId: "char-shadow",
            name: "Shadow",
            status: "should-appear",
            priority: 1,
            appearanceCount: 0,
            mentionedInUpcoming: false,
            relationshipCount: 0,
            reasons: ["缺少登场证据"]
          }
        ]
      },
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    expect(store.plotPilotLearningItems).toHaveLength(6);
    expect(store.plotPilotLearningItems.find((item) => item.id === "context-budget")).toMatchObject({
      status: "done",
      evidenceCount: 3
    });
    expect(store.plotPilotLearningItems.find((item) => item.id === "ai-control-plane")).toMatchObject({
      status: "done",
      evidenceCount: 1,
      active: true,
      entryCommand: { type: "open-audit-report", section: "ai-control-plane" }
    });
    expect(store.plotPilotLearningItems.find((item) => item.id === "knowledge-cast")).toMatchObject({
      status: "done",
      evidenceCount: 2,
      active: true
    });
    expect(store.workbenchRiskSignals.find((signal) => signal.id === "jobs-and-cast")).toMatchObject({
      status: "watch",
      command: {
        type: "open-story-graph",
        characterId: "char-shadow",
        nodeId: "char-shadow",
        appearanceStatus: "should-appear"
      }
    });
  });

  it("projects background jobs and save pipeline states into creation loop signals", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);

    store.backgroundJobs = [
      backgroundJob({
        id: "job-quality-error",
        type: "quality.series.rebuild",
        status: "error",
        error: "quality failed",
        finishedAt: "2026-06-11T00:00:02.000Z",
        updatedAt: "2026-06-11T00:00:02.000Z"
      })
    ];
    store.savePipelineSteps = [
      {
        id: "quality",
        label: "质量趋势",
        status: "queued",
        detail: "已进入后台队列"
      }
    ];

    expect(store.creationLoopSteps.find((step) => step.id === "review")).toMatchObject({
      signals: expect.arrayContaining(["质量趋势失败", "质量后台队列"])
    });
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

  it("does not run the post-save pipeline by default", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    vi.clearAllMocks();

    store.updateContent("manual edit for ordinary save");
    await store.saveCurrentContent();

    expect(mockNovelApi.saveFile).toHaveBeenCalledWith("demo", "chapters/chapter-001.md", "manual edit for ordinary save");
    expect(mockNovelApi.startTask).not.toHaveBeenCalled();
    expect(mockNovelApi.startBackgroundJob).not.toHaveBeenCalled();
    expect(store.savePipelineSteps).toEqual([]);
  });

  it("runs the opt-in post-save pipeline for chapter content saves", async () => {
    const recap = {
      chapterId: "chapter-001",
      summary: "The gate answered the hero's blood.",
      newFacts: ["The gate reacts to blood."],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      createdAt: "2026-06-11T00:00:00.000Z"
    };
    mockNovelApi.readTask.mockResolvedValue(
      taskWithResult({
        type: "writing.recap",
        result: {
          summary: "Recap ready",
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
    await store.openChapter(project.chapters[0]);
    vi.clearAllMocks();

    store.setAutoRunSavePipeline(true);
    store.updateContent("old pressure becomes new pressure at the sealed gate");
    await store.saveCurrentContent();

    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
      "demo",
      "writing.recap",
      expect.objectContaining({
        chapterId: "chapter-001",
        mode: "chapter.save.pipeline",
        changedCharCount: expect.any(Number),
        previousTail: expect.stringContaining("draft:chapters/chapter-001.md"),
        currentTail: expect.stringContaining("sealed gate")
      })
    );
    expect(mockNovelApi.startBackgroundJob).toHaveBeenCalledWith("demo", "quality.series.rebuild", {
      source: "save-pipeline",
      chapterId: "chapter-001"
    });
    expect(mockNovelApi.startBackgroundJob).toHaveBeenCalledWith("demo", "knowledge.index.rebuild", {
      source: "save-pipeline",
      chapterId: "chapter-001"
    });
    expect(mockNovelApi.startBackgroundJob).toHaveBeenCalledWith("demo", "story.graph.rebuild", {
      source: "save-pipeline",
      chapterId: "chapter-001"
    });
    expect(mockNovelApi.startBackgroundJob).toHaveBeenCalledTimes(3);
    expect(mockNovelApi.readBackgroundJob).not.toHaveBeenCalled();
    expect(mockNovelApi.readCreationRuntimeSnapshot).toHaveBeenCalledWith("demo", "chapter-001");
    expect(mockNovelApi.readSeriesQualityMetrics).not.toHaveBeenCalled();
    expect(mockNovelApi.readKnowledgeIndex).not.toHaveBeenCalled();
    expect(mockNovelApi.readStoryGraph).not.toHaveBeenCalled();
    expect(store.recapCandidate).toMatchObject({ chapterId: "chapter-001", summary: recap.summary });
    expect(store.savePipelineSteps.map((step) => [step.id, step.status])).toEqual([
      ["save", "done"],
      ["recap", "done"],
      ["runtime", "done"],
      ["quality", "queued"],
      ["knowledge", "queued"],
      ["story", "queued"]
    ]);
    expect(store.isRunningSavePipeline).toBe(false);
  });

  it("skips the post-save pipeline for outline documents", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0], "outline");
    vi.clearAllMocks();

    store.setAutoRunSavePipeline(true);
    store.updateContent("outline update");
    await store.saveCurrentContent();

    expect(mockNovelApi.saveFile).toHaveBeenCalledWith("demo", "outline/chapter-001.md", "outline update");
    expect(mockNovelApi.startTask).not.toHaveBeenCalled();
    expect(mockNovelApi.startBackgroundJob).not.toHaveBeenCalled();
    expect(store.savePipelineSteps.find((step) => step.id === "recap")).toMatchObject({ status: "skipped" });
  });

  it("keeps saved content when the post-save recap step fails", async () => {
    mockNovelApi.startTask.mockRejectedValueOnce(new Error("recap failed"));
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    vi.clearAllMocks();

    store.setAutoRunSavePipeline(true);
    store.updateContent("saved before recap failure");
    await expect(store.saveCurrentContent()).resolves.toBeUndefined();

    expect(mockNovelApi.saveFile).toHaveBeenCalledWith("demo", "chapters/chapter-001.md", "saved before recap failure");
    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.error).toBe("recap failed");
    expect(store.savePipelineSteps.find((step) => step.id === "recap")).toMatchObject({ status: "error", detail: "recap failed" });
  });

  it("reverse engineers dashboard and scene cards from the current draft with AI analysis", async () => {
    const aiStructure = {
      dashboard: {
        goal: "让王破封在饥饿与封印反噬之间做出选择。",
        pov: "第一人称视角",
        mainConflict: "王破封必须判断天狗食月到底是灾兆还是封印入口。",
        endingHook: "他意识到月影里的东西正在回应自己的血。",
        status: "drafted"
      },
      scenes: [
        {
          title: "月食压城",
          time: "夜半月食时",
          location: "九山莲台山门外",
          pov: "第一人称视角",
          characters: ["王破封"],
          conflict: "饥饿与封印牵引同时压来，他不能贸然靠近。",
          turn: "封印没有吞掉血，而是主动回应。",
          informationReleased: ["天狗食月和旧封印存在关联"],
          foreshadowingIds: ["seal-blood"],
          powerProgression: "血与封印第一次产生可见共鸣",
          draftAnchor: "印记突然回应了他的血"
        }
      ]
    };
    mockNovelApi.runTask.mockResolvedValue(
      taskWithResult({
        type: "structure.reverse",
        result: {
          summary: "已从正文反写结构",
          content: JSON.stringify(aiStructure),
          changes: ["提取章节目标和场景卡"],
          risks: [],
          questions: [],
          patches: []
        }
      })
    );
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent("主角在山门外发现异常印记，但他不能立刻靠近。印记突然回应了他的血。");

    const generated = await store.reverseEngineerStructureFromDraft();

    expect(generated).toBe(true);
    expect(mockNovelApi.runTask).toHaveBeenCalledWith(
      "demo",
      "structure.reverse",
      expect.objectContaining({
        chapterId: "chapter-001",
        documentKind: "content",
        filePath: "chapters/chapter-001.md",
        draftContent: "主角在山门外发现异常印记，但他不能立刻靠近。印记突然回应了他的血。"
      })
    );
    expect(store.currentDashboard).toMatchObject({
      chapterId: "chapter-001",
      goal: "让王破封在饥饿与封印反噬之间做出选择。",
      pov: "第一人称视角",
      mainConflict: "王破封必须判断天狗食月到底是灾兆还是封印入口。",
      status: "drafted"
    });
    expect(store.sceneCards).toHaveLength(1);
    expect(store.sceneCards[0]).toMatchObject({
      chapterId: "chapter-001",
      order: 1,
      title: "月食压城",
      conflict: "饥饿与封印牵引同时压来，他不能贸然靠近。",
      turn: "封印没有吞掉血，而是主动回应。",
      informationReleased: ["天狗食月和旧封印存在关联"]
    });
    expect(store.rewriteCandidate).toBeNull();
    expect(store.currentTask?.type).toBe("structure.reverse");
    expect(store.structureDraftVersion).toBe(1);
  });

  it("prevents duplicate reverse engineering requests while one is running", async () => {
    const pendingTask = deferred<NovelTask>();
    mockNovelApi.runTask.mockReturnValue(pendingTask.promise);
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent("The hero finds a seal outside the mountain gate, waits, and watches it answer his blood.");

    const firstRun = store.reverseEngineerStructureFromDraft();

    expect(store.isReverseEngineeringStructure).toBe(true);
    expect(store.canReverseEngineerStructure).toBe(false);

    const secondRun = await store.reverseEngineerStructureFromDraft();

    expect(secondRun).toBe(false);
    expect(mockNovelApi.runTask).toHaveBeenCalledTimes(1);

    pendingTask.resolve(
      taskWithResult({
        type: "structure.reverse",
        result: {
          summary: "Reverse structure complete",
          content: JSON.stringify({
            dashboard: {
              goal: "Reverse current chapter structure",
              pov: "First person",
              mainConflict: "The hero must choose between approaching the seal and hiding his identity.",
              endingHook: "The seal answers his blood.",
              status: "drafted"
            },
            scenes: []
          }),
          changes: [],
          risks: [],
          questions: [],
          patches: []
        }
      })
    );

    await expect(firstRun).resolves.toBe(true);
    expect(store.isReverseEngineeringStructure).toBe(false);
  });

  it("generates dashboard and scene cards from a rough chapter idea", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateStructureIdeaInput("主角在雨夜发现师门留下的旧符，想追查又怕暴露身份。");

    const generated = store.generateStructureFromIdea();

    expect(generated).toBe(true);
    expect(store.currentDashboard).toMatchObject({
      chapterId: "chapter-001",
      pov: "主角限知视角",
      status: "planned",
      mainConflict: "主角必须在目标、阻力和代价之间做选择。"
    });
    expect(store.currentDashboard?.goal).toContain("根据想法搭建");
    expect(store.sceneCards.map((scene) => scene.title)).toEqual(["开场抓手", "冲突升级", "钩子落点"]);
  });

  it("saves generated structure in one action", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.generateStructureFromIdea("主角发现封印回应了他的血。");

    await store.saveCurrentStructure();

    expect(mockNovelApi.saveChapterDashboard).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({
        chapterId: "chapter-001",
        status: "planned"
      })
    );
    expect(mockNovelApi.saveSceneCards).toHaveBeenCalledWith(
      "demo",
      "chapter-001",
      expect.arrayContaining([expect.objectContaining({ title: "开场抓手" })])
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
    mockNovelApi.readTask.mockResolvedValue(taskWithResult());
    mockNovelApi.readAiInvocations.mockResolvedValue([invocationForTask()]);
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[1];
    store.currentFilePath = project.chapters[1].contentPath;

    await store.runTask("idea.suggest", { feedback: "Need a smaller turn." });

    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
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
    expect(mockNovelApi.readAiInvocations).toHaveBeenCalledWith("demo");
    expect(store.aiInvocations).toEqual([invocationForTask()]);
    expect(store.rewriteCandidate?.summary).toBe("Generated ideas");
    expect(store.activeTaskType).toBe("idea.suggest");
    expect(store.taskProgress.every((step) => step.status === "done")).toBe(true);
  });

  it("cancels the active async AI task", async () => {
    const started = taskWithResult({ id: "task-cancel", status: "running", result: undefined, timeoutMs: 60_000 });
    const cancelled = taskWithResult({ id: "task-cancel", status: "cancelled", result: undefined, error: "cancelled" });
    mockNovelApi.cancelTask.mockResolvedValueOnce(cancelled);
    const store = useNovelStore();
    store.currentProject = project;
    store.currentTask = started;

    await expect(store.cancelActiveTask()).resolves.toMatchObject({ status: "cancelled" });

    expect(mockNovelApi.cancelTask).toHaveBeenCalledWith("demo", "task-cancel");
    expect(store.currentTask?.status).toBe("cancelled");
    expect(store.taskHistory.filter((item) => item.id === "task-cancel")).toHaveLength(1);
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
      createdAt: "2026-06-04T00:00:00.000Z",
      summaryPatch: {
        summary: "The clue now has a cost.",
        keyEvents: ["Blood wakes the mark."]
      },
      ledgerPatches: [
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
      ]
    };
    mockNovelApi.readTask.mockResolvedValue(
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

    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
      "demo",
      "writing.recap",
      expect.objectContaining({
        chapterId: "chapter-002",
        filePath: "chapters/chapter-002.md"
      })
    );
    expect(store.recapCandidate?.summary).toBe("The clue now has a cost.");
    expect(store.recapCandidate?.summaryPatch?.keyEvents).toEqual(["Blood wakes the mark."]);
    expect(store.recapCandidate?.ledgerPatches?.[0].id).toBe("risk-1");
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
      createdAt: "2026-06-04T00:00:00.000Z",
      riskPatches: [update]
    };
    mockNovelApi.readLedgerEntries.mockResolvedValueOnce([update]);

    await store.acceptWritingRecap();

    expect(mockNovelApi.acceptWritingRecap).toHaveBeenCalledWith("demo", expect.objectContaining({ chapterId: "chapter-002" }));
    expect(mockNovelApi.startBackgroundJob).toHaveBeenCalledWith("demo", "knowledge.index.rebuild", { source: "workspace" });
    expect(mockNovelApi.readBackgroundJob).toHaveBeenCalledWith("demo", "job-knowledge-1");
    expect(mockNovelApi.readKnowledgeIndex).toHaveBeenCalledWith("demo");
    expect(mockNovelApi.saveLedgerEntries).not.toHaveBeenCalled();
    expect(store.backgroundJobs[0]).toMatchObject({ id: "job-knowledge-1", status: "success" });
    expect(store.ledgerEntries).toEqual([update]);
    expect(store.currentChapterSummary?.summary).toBe("The clue now has a cost.");
    expect(store.recapCandidate).toBeNull();
  });

  it("routes chapter planning to the outline document before calling AI", async () => {
    mockNovelApi.readTask.mockResolvedValue(taskWithResult({ type: "chapter.plan" }));
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);

    await store.runTask("chapter.plan");

    expect(store.currentDocumentKind).toBe("outline");
    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
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
    mockNovelApi.readTask.mockResolvedValue(taskWithResult({ type: "assistant.free" }));
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[1];
    store.currentFilePath = project.chapters[1].contentPath;

    await store.runTask("assistant.free", { instruction: "检查这一章的升级节奏。" });

    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
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
    mockNovelApi.startTask.mockRejectedValue(new Error("Codex unavailable"));
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

  it("keeps the polished selection anchor when the editor selection collapses", async () => {
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
    store.currentContent = "before plain line after";
    store.selection = {
      filePath: "chapters/chapter-001.md",
      selectedText: "plain line",
      beforeText: "before ",
      afterText: " after",
      start: 7,
      end: 17
    };

    await store.polishSelection("polish");
    store.updateSelection(null);
    store.acceptRewrite();

    expect(store.currentContent).toBe("before a sharper line after");
  });

  it("diagnoses the current chapter with quality metrics", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent("他在雨夜发现封印，却不能靠近。风声很冷，血落在石阶上。门后突然传来回应，他必须选择是否暴露身份。");

    const diagnosed = await store.diagnoseCurrentChapter();

    expect(diagnosed).toBe(true);
    expect(mockNovelApi.saveChapterQualityReport).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ chapterId: "chapter-001" })
    );
    expect(store.currentQualityReport).toMatchObject({
      chapterId: "chapter-001",
      metrics: expect.arrayContaining([expect.objectContaining({ key: "conflict" }), expect.objectContaining({ key: "tension" })])
    });
    expect(store.currentQualityReport?.metrics).toHaveLength(7);
    expect(store.currentQualityReport?.fixes.length).toBeGreaterThan(0);
    expect(store.currentSeriesQualityMetrics).toMatchObject({
      projectSlug: "demo",
      reportCount: 1,
      averageOverallScore: store.currentQualityReport?.overallScore
    });
  });

  it("requests AI quality rewrite for metrics below 86 and prepares a full-file patch", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent("他在雨夜发现封印，却不能靠近。风声很冷，血落在石阶上。门后突然传来回应，他必须选择是否暴露身份。");
    store.setAutoRunSavePipeline(true);
    store.currentQualityReport = {
      chapterId: "chapter-001",
      overallScore: 82,
      summary: "Hook is weak.",
      metrics: [
        { key: "hook", label: "钩子", score: 68, note: "结尾缺少未完成后果。" },
        { key: "conflict", label: "冲突", score: 90, note: "阻力明确。" }
      ],
      strengths: ["冲突成立"],
      fixes: ["钩子：补一个未完成后果"],
      updatedAt: "2026-06-14T00:00:00.000Z"
    };
    vi.clearAllMocks();
    mockNovelApi.startTask.mockResolvedValueOnce(
      taskWithResult({
        id: "task-quality-1",
        type: "quality.rewrite",
        status: "running",
        result: undefined,
        finishedAt: undefined,
        durationMs: undefined
      })
    );
    mockNovelApi.readTask.mockResolvedValueOnce(
      taskWithResult({
        id: "task-quality-1",
        type: "quality.rewrite",
        result: {
          summary: "质量改造候选",
          content: "他在雨夜发现封印，却不能靠近。门后的人叫出了他的真名。",
          changes: ["钩子：补入未完成后果，目标超过 86"],
          risks: [],
          questions: [],
          patches: [{ target: "outline/chapter-001.md", mode: "replace-file", content: "wrong target" }]
        }
      })
    );

    await expect(store.improveQualityMetrics()).resolves.toBe(true);

    expect(mockNovelApi.saveFile).toHaveBeenCalledWith(
      "demo",
      "chapters/chapter-001.md",
      "他在雨夜发现封印，却不能靠近。风声很冷，血落在石阶上。门后突然传来回应，他必须选择是否暴露身份。"
    );
    expect(mockNovelApi.startBackgroundJob).not.toHaveBeenCalled();
    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
      "demo",
      "quality.rewrite",
      expect.objectContaining({
        chapterId: "chapter-001",
        filePath: "chapters/chapter-001.md",
        targetScore: 86,
        targetMetrics: [expect.objectContaining({ key: "hook", score: 68, gap: 18 })]
      })
    );
    expect(store.rewriteCandidate).toMatchObject({
      summary: "质量改造候选",
      patches: [
        {
          target: "chapters/chapter-001.md",
          mode: "replace-file",
          content: expect.stringContaining("真名")
        }
      ]
    });
    expect(store.rewriteCandidate?.patches).toHaveLength(1);
    expect(store.rewriteCandidateTargetsCurrentFile).toBe(true);
    expect(store.rewriteComparisonOriginalText).toContain("雨夜发现封印");
    expect(store.rewritePatchApplyLabel).toBe("应用整章改造");
    expect(store.canAcceptSelectedRewrite).toBe(false);
    expect(store.isImprovingQualityMetrics).toBe(false);
  });

  it("prefers the current-file quality rewrite patch over commentary content", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent("他在雨夜发现封印，却不能靠近。风声很冷，血落在石阶上。门后突然传来回应。");
    store.currentQualityReport = {
      chapterId: "chapter-001",
      overallScore: 82,
      summary: "Hook is weak.",
      metrics: [{ key: "hook", label: "钩子", score: 68, note: "结尾缺少未完成后果。" }],
      strengths: ["冲突成立"],
      fixes: ["钩子：补一个未完成后果"],
      updatedAt: "2026-06-14T00:00:00.000Z"
    };
    vi.clearAllMocks();
    mockNovelApi.startTask.mockResolvedValueOnce(
      taskWithResult({
        id: "task-quality-patch-priority",
        type: "quality.rewrite",
        status: "running",
        result: undefined,
        finishedAt: undefined,
        durationMs: undefined
      })
    );
    mockNovelApi.readTask.mockResolvedValueOnce(
      taskWithResult({
        id: "task-quality-patch-priority",
        type: "quality.rewrite",
        result: {
          summary: "质量改造候选",
          content: "Commentary: the rewritten chapter is in the patch.",
          changes: ["钩子：补入未完成后果，目标超过 86"],
          risks: [],
          questions: [],
          patches: [{ target: "chapters/chapter-001.md", mode: "replace-file", content: "完整正文：门后的人叫出了他的真名。" }]
        }
      })
    );

    await expect(store.improveQualityMetrics()).resolves.toBe(true);

    expect(store.rewriteCandidate?.content).toBe("完整正文：门后的人叫出了他的真名。");
    expect(store.rewriteCandidate?.patches).toEqual([
      { target: "chapters/chapter-001.md", mode: "replace-file", content: "完整正文：门后的人叫出了他的真名。" }
    ]);
  });

  it("adds macro pacing guardrails for early chapter over-reveal", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent(
      "他终于明白真相：尸王的身份、封印规则、幕后秘密、全部来历和答案都已经彻底揭开。敌人退去，没有代价，所有问题彻底解决，尘埃落定。"
    );

    await store.diagnoseCurrentChapter();

    expect(store.currentQualityReport?.fixes).toEqual(expect.arrayContaining([expect.stringContaining("宏观节奏")]));
    expect(store.currentQualityReport?.metrics.find((metric) => metric.key === "information")?.note).toContain("宏观节奏风险");
  });

  it("rebuilds series quality metrics through a background job", async () => {
    const store = useNovelStore();
    store.currentProject = project;

    await store.rebuildSeriesQualityMetrics();

    expect(mockNovelApi.startBackgroundJob).toHaveBeenCalledWith("demo", "quality.series.rebuild", { source: "workspace" });
    expect(mockNovelApi.readBackgroundJob).toHaveBeenCalledWith("demo", "job-knowledge-1");
    expect(mockNovelApi.readSeriesQualityMetrics).toHaveBeenCalledWith("demo");
    expect(store.currentSeriesQualityMetrics).toMatchObject({ projectSlug: "demo" });
    expect(store.backgroundJobs[0]).toMatchObject({ id: "job-knowledge-1", status: "success" });
    expect(store.isRebuildingSeriesQualityMetrics).toBe(false);
  });

  it("rebuilds story graph through a background job", async () => {
    const store = useNovelStore();
    store.currentProject = project;

    await store.rebuildStoryGraph();

    expect(mockNovelApi.startBackgroundJob).toHaveBeenCalledWith("demo", "story.graph.rebuild", { source: "workspace" });
    expect(mockNovelApi.readBackgroundJob).toHaveBeenCalledWith("demo", "job-knowledge-1");
    expect(mockNovelApi.readStoryGraph).toHaveBeenCalledWith("demo");
    expect(store.storyGraph).toMatchObject({ projectSlug: "demo" });
    expect(store.backgroundJobs[0]).toMatchObject({ id: "job-knowledge-1", status: "success" });
    expect(store.isRebuildingStoryGraph).toBe(false);
  });

  it("creates a style-tuned rewrite candidate for the selected text", () => {
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[0];
    store.currentContent = "他非常害怕，却还是向前。";
    store.selection = {
      filePath: "chapters/chapter-001.md",
      selectedText: "他非常害怕，却还是向前。",
      beforeText: "",
      afterText: "",
      start: 0,
      end: 11
    };

    const tuned = store.tuneSelectionStyle("tense");

    expect(tuned).toBe(true);
    expect(store.styleTone).toBe("tense");
    expect(store.rewriteCandidate).toMatchObject({
      summary: "文风调音：压迫感",
      changes: expect.arrayContaining(["调整为压迫感"])
    });
    expect(store.rewriteCandidate?.content).toContain("危险显得更近");
  });

  it("builds a focus writing guide from dashboard and scene cards", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateFocusTargetWords(1600);
    store.updateDashboard({
      goal: "让主角发现线索并付出代价。",
      pov: "主角有限视角",
      mainConflict: "靠近线索会暴露身份。",
      endingHook: "门后有人回应。"
    });
    store.updateSceneCards([
      {
        id: "scene-1",
        chapterId: "chapter-001",
        order: 1,
        title: "雨夜线索",
        time: "",
        location: "",
        pov: "主角有限视角",
        characters: [],
        conflict: "靠近线索会暴露身份。",
        turn: "主角听见门后回应，却不能立刻退走。",
        informationReleased: [],
        foreshadowingIds: [],
        powerProgression: "",
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    ]);
    store.updateContent("他在雨夜发现封印，却不能靠近。");

    expect(store.focusWritingGuide).toMatchObject({
      chapterId: "chapter-001",
      targetWords: 1600,
      sceneTitle: "雨夜线索",
      nextBeat: "主角听见门后回应，却不能立刻退走。"
    });
    expect(store.focusWritingGuide.guardrails).toContain("目标：让主角发现线索并付出代价。");
    expect(store.focusWritingGuide.prompt).toContain("保持主角有限视角");
  });

  it("clamps focus target words to a practical range", () => {
    const store = useNovelStore();

    expect(store.focusTargetWords).toBe(3000);

    store.updateFocusTargetWords(80);
    expect(store.focusTargetWords).toBe(300);

    store.updateFocusTargetWords(20000);
    expect(store.focusTargetWords).toBe(12000);

    store.updateFocusTargetWords(Number.NaN);
    expect(store.focusTargetWords).toBe(3000);
  });

  it("stores focus draft micro-command with a bounded length", () => {
    const store = useNovelStore();

    store.updateFocusDraftInstruction("让动作更直接，少解释设定。");
    expect(store.focusDraftInstruction).toBe("让动作更直接，少解释设定。");

    store.updateFocusDraftInstruction("微".repeat(260));
    expect(store.focusDraftInstruction).toHaveLength(240);
  });

  it("requests a focus draft from the next beat guide", async () => {
    mockNovelApi.readTask.mockResolvedValue(
      taskWithResult({
        type: "chapter.draft",
        result: {
          summary: "下一段候选",
          content: "雨声压低，他终于听见门后的回音。",
          changes: ["承接下一笔"],
          risks: [],
          questions: [],
          patches: []
        }
      })
    );
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateDashboard({
      goal: "让主角发现线索并付出代价。",
      pov: "主角有限视角",
      mainConflict: "靠近线索会暴露身份。"
    });
    store.updateSceneCards([
      {
        id: "scene-1",
        chapterId: "chapter-001",
        order: 1,
        title: "雨夜线索",
        time: "",
        location: "",
        pov: "主角有限视角",
        characters: [],
        conflict: "靠近线索会暴露身份。",
        turn: "主角听见门后回应，却不能立刻退走。",
        informationReleased: [],
        foreshadowingIds: [],
        powerProgression: "",
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    ]);
    store.updateContent("他停在门前。");
    store.updateFocusDraftInstruction("让动作更直接，少解释设定。");

    await store.requestFocusDraft();

    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
      "demo",
      "chapter.draft",
      expect.objectContaining({
        chapterId: "chapter-001",
        mode: "focus.next-draft",
        appendAfterCurrentDraft: true,
        authorInstruction: "让动作更直接，少解释设定。",
        feedback: expect.stringContaining("请只生成可以直接接在当前正文后面的一段或数段候选正文。"),
        focusGuide: expect.objectContaining({
          nextBeat: "主角听见门后回应，却不能立刻退走。"
        })
      })
    );
    expect(store.rewriteCandidate?.content).toBe("雨声压低，他终于听见门后的回音。");
  });

  it("requests a tuned focus draft revision from the current candidate", async () => {
    mockNovelApi.readTask.mockResolvedValue(
      taskWithResult({
        type: "chapter.draft",
        result: {
          summary: "Revised next paragraph",
          content: "A tighter candidate paragraph.",
          changes: ["Raised pressure"],
          risks: [],
          questions: [],
          patches: []
        }
      })
    );
    const store = useNovelStore();
    store.currentProject = project;
    await store.openChapter(project.chapters[0]);
    store.updateContent("Current chapter tail.");
    store.rewriteCandidate = {
      summary: "Next paragraph",
      content: "Candidate paragraph.",
      changes: [],
      risks: [],
      questions: [],
      patches: []
    };
    store.updateFocusDraftInstruction("更冷一点，不要煽情。");

    const requested = await store.requestFocusDraftRevision("增强压迫感");

    expect(requested).toBe(true);
    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
      "demo",
      "chapter.draft",
      expect.objectContaining({
        chapterId: "chapter-001",
        mode: "focus.refine-draft",
        revisionDirection: "增强压迫感",
        authorInstruction: "更冷一点，不要煽情。",
        currentCandidate: "Candidate paragraph.",
        feedback: expect.stringContaining("当前候选正文：\nCandidate paragraph.")
      })
    );
    expect(store.rewriteCandidate?.content).toBe("A tighter candidate paragraph.");
  });

  it("accepts a focus draft by appending it and requesting a recap", async () => {
    const recap: WritingRecapCandidate = {
      chapterId: "chapter-001",
      summary: "The accepted paragraph adds a door response.",
      newFacts: ["The sealed door responds to the hero."],
      characterStateChanges: ["The hero realizes retreat has a cost."],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      createdAt: "2026-06-04T00:00:00.000Z"
    };
    mockNovelApi.readTask.mockResolvedValue(
      taskWithResult({
        type: "writing.recap",
        result: {
          summary: "Post-save recap",
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
    store.currentChapter = project.chapters[0];
    store.currentContent = "他停在门前。  \n";
    store.currentDashboard = {
      chapterId: "chapter-001",
      goal: "",
      pov: "",
      mainConflict: "",
      endingHook: "",
      wordCount: 0,
      status: "drafting",
      unresolvedForeshadowingIds: [],
      continuityRiskIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    store.rewriteCandidate = {
      summary: "下一段候选",
      content: "雨声压低，他终于听见门后的回音。",
      changes: [],
      risks: [],
      questions: [],
      patches: []
    };

    const accepted = await store.acceptFocusDraft();

    expect(accepted).toBe(true);
    expect(mockNovelApi.startTask).toHaveBeenCalledWith(
      "demo",
      "writing.recap",
      expect.objectContaining({
        chapterId: "chapter-001",
        mode: "focus.accepted-draft",
        acceptedDraft: expect.any(String),
        previousTail: expect.any(String),
        instruction: expect.stringContaining("WritingRecapCandidate JSON")
      })
    );
    expect(store.recapCandidate?.summary).toBe("The accepted paragraph adds a door response.");
    expect(store.currentContent).toBe("他停在门前。\n\n雨声压低，他终于听见门后的回音。");
    expect(store.currentDashboard.wordCount).toBe(store.currentContent.replace(/\s+/g, "").length);
    expect(store.rewriteCandidate).toBeNull();
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
    store.currentTask = taskWithResult();
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
    ], "task-1");
    expect(mockNovelApi.readAiInvocations).toHaveBeenCalledWith("demo");
    expect(mockNovelApi.readFile).toHaveBeenCalledWith("demo", "chapters/chapter-001.md");
    expect(store.currentContent).toBe("draft:chapters/chapter-001.md");
  });

  it("re-diagnoses automatically after applying a quality rewrite patch", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[0];
    store.currentFilePath = "chapters/chapter-001.md";
    store.currentTask = taskWithResult({ id: "task-quality-1", type: "quality.rewrite" });
    store.rewriteCandidate = {
      summary: "Quality patch",
      content: "",
      changes: [],
      risks: [],
      questions: [],
      patches: [{ target: "chapters/chapter-001.md", mode: "replace-file", content: "accepted quality rewrite" }]
    };
    mockNovelApi.readFile.mockResolvedValueOnce(
      "他在雨夜发现封印，却不能靠近。风声很冷，血落在石阶上。门后突然叫出他的真名，他必须选择是否暴露身份，并承担失去藏身处的代价。"
    );

    await store.applyTaskPatches();

    expect(mockNovelApi.applyPatches).toHaveBeenCalledWith("demo", [
      { target: "chapters/chapter-001.md", mode: "replace-file", content: "accepted quality rewrite" }
    ], "task-quality-1");
    expect(mockNovelApi.saveChapterQualityReport).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ chapterId: "chapter-001" })
    );
    expect(store.currentQualityReport?.chapterId).toBe("chapter-001");
  });

  it("normalizes cached quality rewrite patches before applying them", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[0];
    store.currentFilePath = "chapters/chapter-001.md";
    store.currentTask = taskWithResult({ id: "task-quality-2", type: "quality.rewrite" });
    store.rewriteCandidate = {
      summary: "Cached quality patch",
      content: "",
      changes: [],
      risks: [],
      questions: [],
      patches: [{ target: "outline/chapter-001.md", mode: "replace-file", content: "cached full chapter rewrite" }]
    };
    mockNovelApi.readFile.mockResolvedValueOnce(
      "他在雨夜发现封印，却不能靠近。门后的人叫出他的真名，他必须付出代价。"
    );

    await store.applyTaskPatches();

    expect(mockNovelApi.applyPatches).toHaveBeenCalledWith("demo", [
      { target: "chapters/chapter-001.md", mode: "replace-file", content: "cached full chapter rewrite" }
    ], "task-quality-2");
  });

  it("fills replace-selection patch coordinates from the polished selection anchor", async () => {
    const store = useNovelStore();
    store.currentProject = project;
    store.currentChapter = project.chapters[0];
    store.currentFilePath = "chapters/chapter-001.md";
    store.selection = {
      filePath: "chapters/chapter-001.md",
      selectedText: "plain line",
      beforeText: "before ",
      afterText: " after",
      start: 7,
      end: 17
    };
    mockNovelApi.polishSelection.mockResolvedValue(
      taskWithResult({
        type: "selection.polish",
        result: {
          summary: "Patch",
          content: "",
          changes: [],
          risks: [],
          questions: [],
          patches: [{ target: "chapters/chapter-001.md", mode: "replace-selection", content: "a sharper line" }]
        }
      })
    );

    await store.polishSelection("polish");
    store.updateSelection(null);
    await store.applyTaskPatches();

    expect(mockNovelApi.applyPatches).toHaveBeenCalledWith("demo", [
      {
        target: "chapters/chapter-001.md",
        mode: "replace-selection",
        content: "a sharper line",
        selection: { start: 7, end: 17 }
      }
    ], "task-1");
  });
});
