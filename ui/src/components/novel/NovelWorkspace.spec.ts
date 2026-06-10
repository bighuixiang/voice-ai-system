import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import NovelWorkspace from "./NovelWorkspace.vue";

const route = vi.hoisted(() => ({
  name: "project-workspace",
  params: { slug: "demo" },
  fullPath: "/projects/demo"
}));

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn()
}));

const storeRef = vi.hoisted(() => ({
  value: {} as Record<string, unknown>
}));

enableAutoUnmount(afterEach);

vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => router
}));

vi.mock("@/stores/novel", () => ({
  useNovelStore: () => storeRef.value
}));

vi.mock("@/stores/theme", () => ({
  useThemeStore: () => ({
    isDark: true,
    toggleTheme: vi.fn()
  })
}));

const project = {
  id: "demo",
  slug: "demo",
  title: "Demo Novel",
  genre: "fantasy",
  roughIdea: "",
  createdAt: "2026-06-04T00:00:00.000Z",
  updatedAt: "2026-06-04T00:00:00.000Z",
  lastOpenedChapterId: "chapter-001",
  codex: { command: "codex" },
  chapters: [
    {
      id: "chapter-001",
      title: "Chapter 1",
      outlinePath: "outline/chapter-001.md",
      contentPath: "chapters/chapter-001.md",
      status: "drafted"
    }
  ]
};

function makeStore(writingMode: "focus" | "structure" | "review") {
  return {
    projects: [project],
    openWorkspaceProjects: [project],
    currentProject: project,
    currentChapter: project.chapters[0],
    hasProject: true,
    writingMode,
    setWritingMode: vi.fn(),
    isLoading: false,
    isSavingDashboard: false,
    isSavingScenes: false,
    isReverseEngineeringStructure: false,
    isSavingContent: false,
    currentDashboard: {
      chapterId: "chapter-001",
      goal: "Keep the clue grounded.",
      pov: "Hero",
      mainConflict: "",
      endingHook: "",
      wordCount: 1200,
      status: "drafting",
      unresolvedForeshadowingIds: [],
      continuityRiskIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    },
    sceneCards: [],
    structureIdeaInput: "",
    structureDraftVersion: 0,
    canReverseEngineerStructure: true,
    storyControl: {
      version: 1,
      premise: "A careful hero opens a sealed gate.",
      arcs: [],
      characters: [],
      events: [],
      orchestrationNotes: "Keep upgrades causal.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    },
    storyGraph: {
      projectSlug: "demo",
      nodes: [{ id: "chapter:chapter-001", type: "chapter", label: "Chapter 1" }],
      edges: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    knowledgeIndex: {
      projectSlug: "demo",
      facts: [],
      triples: [],
      chapterIndex: { projectSlug: "demo", chapters: [], keywords: {}, updatedAt: "2026-06-11T00:00:00.000Z" },
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    isSavingStoryControl: false,
    isRebuildingKnowledgeIndex: false,
    canRequestStoryOrchestration: true,
    currentDocumentKind: "content",
    currentDocumentLabel: "章节正文",
    currentFilePath: "chapters/chapter-001.md",
    currentContent: "draft",
    hasUnsavedChanges: false,
    currentSaveStateLabel: "已保存",
    selection: null,
    rewriteCandidate: null,
    currentQualityReport: null,
    styleTone: "elegant",
    focusTargetWords: 3000,
    focusDraftInstruction: "",
    focusWritingGuide: {
      chapterId: "chapter-001",
      targetWords: 3000,
      currentWords: 1200,
      progressPercent: 60,
      stageLabel: "冲突升级",
      sceneTitle: "Chapter 1",
      nextBeat: "Keep pushing the clue.",
      guardrails: ["目标：Keep the clue grounded."],
      prompt: "Focus prompt",
      updatedAt: "2026-06-04T00:00:00.000Z"
    },
    canRequestFocusDraft: true,
    canDiagnoseChapter: true,
    canTuneSelection: false,
    currentTask: null,
    taskProgress: [],
    creationLoopSteps: [],
    currentRuntimeSnapshot: null,
    recapCandidate: null,
    taskHistory: [],
    agentProfiles: [],
    agentChecks: [],
    defaultAgentProfileId: "codex-cli",
    isSavingAiConfig: false,
    platformAiConfig: {
      version: 1,
      defaultScenario: "novel",
      scenarios: {
        novel: { profileId: "codex-cli" },
        assets: { profileId: "codex-cli" },
        script: { profileId: "codex-cli" },
        "image-generation": { profileId: "codex-cli" },
        "video-generation": { profileId: "codex-cli" }
      },
      updatedAt: "2026-06-04T00:00:00.000Z"
    },
    activeNovelAiSummary: "Codex CLI · 默认模型",
    activeNovelAgentCheck: undefined,
    platformLibrary: null,
    supportFiles: [],
    currentSupportPath: "",
    supportContent: "",
    hasUnsavedSupportChanges: false,
    ledgerEntries: [],
    activeLedgerKind: "risk",
    error: "",
    loadProjects: vi.fn().mockResolvedValue(undefined),
    loadPlatformLibrary: vi.fn().mockResolvedValue(undefined),
    loadPlatformAiConfig: vi.fn().mockResolvedValue(undefined),
    loadAgentProfiles: vi.fn().mockResolvedValue(undefined),
    savePlatformAiConfig: vi.fn().mockResolvedValue(undefined),
    checkAgentProfile: vi.fn().mockResolvedValue({ available: true, label: "Codex CLI" }),
    openProject: vi.fn().mockResolvedValue(undefined),
    showProjectHub: vi.fn(),
    closeWorkspace: vi.fn().mockResolvedValue(undefined),
    openChapter: vi.fn(),
    updateDashboard: vi.fn(),
    saveCurrentDashboard: vi.fn(),
    updateSceneCards: vi.fn(),
    saveCurrentSceneCards: vi.fn(),
    saveCurrentStructure: vi.fn(),
    updateStructureIdeaInput: vi.fn(),
    reverseEngineerStructureFromDraft: vi.fn(),
    generateStructureFromIdea: vi.fn(),
    updateStoryControl: vi.fn(),
    saveStoryControl: vi.fn(),
    loadStoryGraph: vi.fn().mockResolvedValue(undefined),
    rebuildKnowledgeIndex: vi.fn().mockResolvedValue(undefined),
    requestStoryOrchestration: vi.fn(),
    updateContent: vi.fn(),
    openChapterDocument: vi.fn(),
    updateSelection: vi.fn(),
    saveCurrentContent: vi.fn(),
    polishSelection: vi.fn(),
    updateFocusTargetWords: vi.fn(),
    updateFocusDraftInstruction: vi.fn(),
    requestFocusDraft: vi.fn(),
    requestFocusDraftRevision: vi.fn(),
    diagnoseCurrentChapter: vi.fn(),
    updateStyleTone: vi.fn(),
    tuneSelectionStyle: vi.fn(),
    acceptRewrite: vi.fn(),
    acceptFocusDraft: vi.fn(),
    rejectRewrite: vi.fn(),
    applyTaskPatches: vi.fn(),
    runTask: vi.fn(),
    runCreationLoopAction: vi.fn(),
    acceptWritingRecap: vi.fn(),
    rejectWritingRecap: vi.fn(),
    createSharedAsset: vi.fn(),
    linkSharedAsset: vi.fn(),
    openSupportFile: vi.fn(),
    updateSupportContent: vi.fn(),
    saveSupportContent: vi.fn(),
    loadLedger: vi.fn(),
    updateLedgerEntries: vi.fn(),
    saveLedger: vi.fn(),
    importProject: vi.fn()
  };
}

const stubs = {
  "el-button": {
    emits: ["click"],
    template: `<button @click="$emit('click')"><slot /></button>`
  },
  "el-dialog": {
    props: ["modelValue"],
    template: `<section v-if="modelValue" class="dialog-stub"><slot /></section>`
  },
  "el-icon": { template: "<span><slot /></span>" },
  Collection: true,
  Close: true,
  Folder: true,
  Loading: true,
  Refresh: true,
  Setting: true,
  ProjectManagerPanel: { template: "<div />" },
  ProjectCreatePanel: { template: "<div />" },
  AiConfigPanel: { template: "<button class='ai-config-stub'>ai config</button>" },
  PlatformLibraryPanel: { template: "<div class='platform-stub'>platform</div>" },
  ChapterTree: { template: "<div class='tree-stub'>tree</div>" },
  WritingModeSwitcher: { props: ["mode"], template: "<div class='mode-switcher-stub'>{{ mode }}</div>" },
  CreationLoopPanel: {
    props: ["steps", "runtimeSnapshot"],
    emits: ["action"],
    template: "<button class='creation-loop-stub' @click='$emit(\"action\", steps?.[0]?.action)'>loop</button>"
  },
  FocusWritingPanel: {
    props: ["instruction"],
    emits: ["generate-draft", "update-instruction"],
    template: `
      <div>
        <input class="focus-instruction-stub" :value="instruction" @input="$emit('update-instruction', $event.target.value)" />
        <button class="focus-stub" @click="$emit('generate-draft')">focus guide</button>
      </div>
    `
  },
  StructureQuickStartPanel: { template: "<div class='quick-start-stub'>quick start</div>" },
  StoryControlPanel: {
    emits: ["orchestrate"],
    template: "<button class='story-control-stub' @click='$emit(\"orchestrate\")'>story control</button>"
  },
  StoryGraphPanel: { template: "<div class='story-graph-stub'>story graph</div>" },
  KnowledgeIndexPanel: { template: "<div class='knowledge-index-stub'>knowledge index</div>" },
  ChapterDashboardPanel: { template: "<div class='dashboard-stub'>dashboard</div>" },
  SceneCardPanel: { template: "<div class='scene-stub'>scene</div>" },
  ChapterEditor: { template: "<div class='editor-stub'>editor</div>" },
  SelectionToolbar: { template: "<div class='selection-stub'>selection</div>" },
  ReviewQualityPanel: { template: "<div class='quality-stub'>quality</div>" },
  RewriteComparison: {
    props: ["tuneOptions"],
    emits: ["tune"],
    template: "<button class='rewrite-stub' @click='$emit(\"tune\", tuneOptions?.[0]?.value)'>rewrite</button>"
  },
  AIOperationPanel: { template: "<div class='ai-stub'>ai</div>" },
  WritingRecapPanel: { template: "<div class='recap-stub'>recap</div>" },
  TaskHistoryPanel: { template: "<div class='history-stub'>history</div>" },
  ContextPanel: { template: "<div class='context-stub'>context</div>" },
  SupportFilePanel: { template: "<div class='support-stub'>support</div>" },
  LedgerPanel: { template: "<div class='ledger-stub'>ledger</div>" }
};

describe("NovelWorkspace writing modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps focus mode centered on the editor and focus guide", () => {
    storeRef.value = makeStore("focus");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });

    expect(wrapper.find(".left-rail").exists()).toBe(false);
    expect(wrapper.find(".right-rail").exists()).toBe(false);
    expect(wrapper.find(".focus-stub").exists()).toBe(true);
    expect(wrapper.find(".dashboard-stub").exists()).toBe(false);
    expect(wrapper.find(".editor-stub").exists()).toBe(true);
  });

  it("routes focus guide generation to the store", async () => {
    storeRef.value = makeStore("focus");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });
    await wrapper.find(".focus-stub").trigger("click");

    expect(storeRef.value.requestFocusDraft).toHaveBeenCalled();
  });

  it("routes creation loop actions to the store", async () => {
    storeRef.value = {
      ...makeStore("focus"),
      creationLoopSteps: [
        {
          id: "draft",
          label: "正文",
          status: "active",
          detail: "保存后进入审稿",
          action: "save-draft",
          actionLabel: "保存正文"
        }
      ]
    };

    const wrapper = mount(NovelWorkspace, { global: { stubs } });
    await wrapper.find(".creation-loop-stub").trigger("click");

    expect(storeRef.value.runCreationLoopAction).toHaveBeenCalledWith("save-draft");
  });

  it("syncs focus micro-command input to the store", async () => {
    storeRef.value = makeStore("focus");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });
    await wrapper.find(".focus-instruction-stub").setValue("多写一点压迫感，别解释设定。");

    expect(storeRef.value.updateFocusDraftInstruction).toHaveBeenCalledWith("多写一点压迫感，别解释设定。");
  });

  it("shows focus draft candidate when AI continues the next beat", () => {
    storeRef.value = {
      ...makeStore("focus"),
      rewriteCandidate: {
        summary: "下一段候选",
        content: "雨声压低，他终于听见门后的回音。",
        changes: [],
        risks: [],
        questions: [],
        patches: []
      }
    };

    const wrapper = mount(NovelWorkspace, { global: { stubs } });

    expect(wrapper.find(".rewrite-stub").exists()).toBe(true);
  });

  it("routes focus draft tuning to the store", async () => {
    storeRef.value = {
      ...makeStore("focus"),
      rewriteCandidate: {
        summary: "Next draft",
        content: "Candidate paragraph.",
        changes: [],
        risks: [],
        questions: [],
        patches: []
      }
    };

    const wrapper = mount(NovelWorkspace, { global: { stubs } });
    await wrapper.find(".rewrite-stub").trigger("click");

    expect(storeRef.value.requestFocusDraftRevision).toHaveBeenCalledWith(expect.stringContaining("增强压迫感"));
  });

  it("shows accepted draft recap in focus mode", () => {
    storeRef.value = {
      ...makeStore("focus"),
      recapCandidate: {
        chapterId: "chapter-001",
        summary: "New facts need ledger confirmation.",
        newFacts: [],
        characterStateChanges: [],
        foreshadowingUpdates: [],
        continuityRisks: [],
        powerProgressionUpdates: [],
        createdAt: "2026-06-04T00:00:00.000Z"
      }
    };

    const wrapper = mount(NovelWorkspace, { global: { stubs } });

    expect(wrapper.find(".recap-stub").exists()).toBe(true);
  });

  it("shows review tools without structure planning panels in review mode", () => {
    storeRef.value = makeStore("review");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });

    expect(wrapper.find(".rewrite-stub").exists()).toBe(true);
    expect(wrapper.find(".quality-stub").exists()).toBe(true);
    expect(wrapper.find(".ledger-stub").exists()).toBe(true);
    expect(wrapper.find(".history-stub").exists()).toBe(true);
    expect(wrapper.find(".scene-stub").exists()).toBe(false);
    expect(wrapper.find(".ai-stub").exists()).toBe(false);
  });

  it.each([
    ["Ctrl+S", { ctrlKey: true }],
    ["Cmd+S", { metaKey: true }]
  ])("saves the current document with %s instead of opening browser save", async (_label, modifier) => {
    storeRef.value = makeStore("review");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });
    const event = new KeyboardEvent("keydown", {
      key: "s",
      cancelable: true,
      ...modifier
    });
    const preventDefault = vi.spyOn(event, "preventDefault");

    window.dispatchEvent(event);
    await flushPromises();
    wrapper.unmount();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(storeRef.value.saveCurrentContent).toHaveBeenCalledTimes(1);
  });

  it("shows quick structure generation tools in structure mode", () => {
    storeRef.value = makeStore("structure");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });

    expect(wrapper.find(".quick-start-stub").exists()).toBe(true);
    expect(wrapper.find(".dashboard-stub").exists()).toBe(true);
    expect(wrapper.find(".scene-stub").exists()).toBe(true);
    expect(wrapper.find(".editor-stub").exists()).toBe(true);
    expect(wrapper.find(".story-control-stub").exists()).toBe(false);
  });

  it("opens the global story control from the workspace header", async () => {
    storeRef.value = makeStore("structure");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });
    const storyControlButton = wrapper.findAll("button").find((button) => button.text().includes("故事总控"));

    expect(storyControlButton).toBeTruthy();
    await storyControlButton?.trigger("click");

    expect(wrapper.find(".story-control-stub").exists()).toBe(true);
    expect(wrapper.find(".story-graph-stub").exists()).toBe(true);
    expect(wrapper.find(".knowledge-index-stub").exists()).toBe(true);
    await wrapper.find(".story-control-stub").trigger("click");
    expect(storeRef.value.requestStoryOrchestration).toHaveBeenCalled();
  });
});
