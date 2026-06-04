import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
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

vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => router
}));

vi.mock("@/stores/novel", () => ({
  useNovelStore: () => storeRef.value
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
    currentDocumentKind: "content",
    currentDocumentLabel: "章节正文",
    currentFilePath: "chapters/chapter-001.md",
    currentContent: "draft",
    hasUnsavedChanges: false,
    currentSaveStateLabel: "已保存",
    selection: null,
    rewriteCandidate: null,
    currentTask: null,
    taskProgress: [],
    recapCandidate: null,
    taskHistory: [],
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
    openProject: vi.fn().mockResolvedValue(undefined),
    showProjectHub: vi.fn(),
    closeWorkspace: vi.fn().mockResolvedValue(undefined),
    openChapter: vi.fn(),
    updateDashboard: vi.fn(),
    saveCurrentDashboard: vi.fn(),
    updateSceneCards: vi.fn(),
    saveCurrentSceneCards: vi.fn(),
    updateContent: vi.fn(),
    openChapterDocument: vi.fn(),
    updateSelection: vi.fn(),
    saveCurrentContent: vi.fn(),
    polishSelection: vi.fn(),
    acceptRewrite: vi.fn(),
    rejectRewrite: vi.fn(),
    applyTaskPatches: vi.fn(),
    runTask: vi.fn(),
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
  "el-icon": { template: "<span><slot /></span>" },
  Close: true,
  Folder: true,
  Loading: true,
  Refresh: true,
  ProjectManagerPanel: { template: "<div />" },
  ProjectCreatePanel: { template: "<div />" },
  PlatformLibraryPanel: { template: "<div class='platform-stub'>platform</div>" },
  ChapterTree: { template: "<div class='tree-stub'>tree</div>" },
  WritingModeSwitcher: { props: ["mode"], template: "<div class='mode-switcher-stub'>{{ mode }}</div>" },
  ChapterDashboardPanel: { template: "<div class='dashboard-stub'>dashboard</div>" },
  SceneCardPanel: { template: "<div class='scene-stub'>scene</div>" },
  ChapterEditor: { template: "<div class='editor-stub'>editor</div>" },
  SelectionToolbar: { template: "<div class='selection-stub'>selection</div>" },
  RewriteComparison: { template: "<div class='rewrite-stub'>rewrite</div>" },
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

  it("keeps focus mode centered on the editor and dashboard summary", () => {
    storeRef.value = makeStore("focus");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });

    expect(wrapper.find(".left-rail").exists()).toBe(false);
    expect(wrapper.find(".right-rail").exists()).toBe(false);
    expect(wrapper.find(".focus-dashboard-summary").exists()).toBe(true);
    expect(wrapper.text()).toContain("字数：1200");
    expect(wrapper.find(".dashboard-stub").exists()).toBe(false);
    expect(wrapper.find(".editor-stub").exists()).toBe(true);
  });

  it("shows review tools without structure planning panels in review mode", () => {
    storeRef.value = makeStore("review");

    const wrapper = mount(NovelWorkspace, { global: { stubs } });

    expect(wrapper.find(".rewrite-stub").exists()).toBe(true);
    expect(wrapper.find(".ledger-stub").exists()).toBe(true);
    expect(wrapper.find(".history-stub").exists()).toBe(true);
    expect(wrapper.find(".scene-stub").exists()).toBe(false);
    expect(wrapper.find(".ai-stub").exists()).toBe(false);
  });
});
