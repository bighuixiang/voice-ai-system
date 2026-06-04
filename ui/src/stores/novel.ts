import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { novelApi } from "@/services/novelApi";
import type {
  ChapterDashboard,
  CodexTaskResult,
  CodexTaskType,
  ChapterDocumentKind,
  EditorSelection,
  LedgerEntry,
  NovelChapter,
  NovelProject,
  NovelTask,
  PlatformAsset,
  PlatformAssetType,
  PlatformLibrary,
  SceneCard,
  TaskProgressStep,
  WritingMode,
  WritingRecapCandidate
} from "@/types/novel";

type LedgerKind = LedgerEntry["kind"];

interface WorkspaceCache {
  project: NovelProject;
  chapterId: string | null;
  documentKind: ChapterDocumentKind;
  filePath: string;
  content: string;
  savedContent: string;
  lastSavedAt: string;
  selection: EditorSelection | null;
  currentTask: NovelTask | null;
  taskProgress: TaskProgressStep[];
  taskHistory: NovelTask[];
  rewriteCandidate: CodexTaskResult | null;
  recapCandidate: WritingRecapCandidate | null;
  dashboard: ChapterDashboard | null;
  sceneCards: SceneCard[];
  ledgerKind: LedgerKind;
  ledgerEntries: LedgerEntry[];
  writingMode: WritingMode;
  supportPath: string;
  supportContent: string;
  savedSupportContent: string;
}

interface WorkspaceSwitchOptions {
  skipLeaveCheck?: boolean;
}

export const useNovelStore = defineStore("novel", () => {
  const projects = ref<NovelProject[]>([]);
  const openWorkspaceSlugs = ref<string[]>([]);
  const workspaceCache = ref<Record<string, WorkspaceCache>>({});
  const currentProject = ref<NovelProject | null>(null);
  const currentChapter = ref<NovelChapter | null>(null);
  const currentDocumentKind = ref<ChapterDocumentKind>("content");
  const currentFilePath = ref("");
  const currentContent = ref("");
  const savedContent = ref("");
  const isSavingContent = ref(false);
  const lastSavedAt = ref("");
  const selection = ref<EditorSelection | null>(null);
  const currentTask = ref<NovelTask | null>(null);
  const taskProgress = ref<TaskProgressStep[]>([]);
  const taskHistory = ref<NovelTask[]>([]);
  const rewriteCandidate = ref<CodexTaskResult | null>(null);
  const recapCandidate = ref<WritingRecapCandidate | null>(null);
  const currentDashboard = ref<ChapterDashboard | null>(null);
  const sceneCards = ref<SceneCard[]>([]);
  const activeLedgerKind = ref<LedgerKind>("foreshadowing");
  const ledgerEntries = ref<LedgerEntry[]>([]);
  const writingMode = ref<WritingMode>("structure");
  const isSavingDashboard = ref(false);
  const isSavingScenes = ref(false);
  const platformLibrary = ref<PlatformLibrary | null>(null);
  const supportFiles = [
    { label: "角色", path: "bible/characters.md" },
    { label: "世界观", path: "bible/world.md" },
    { label: "力量体系", path: "bible/power-system.md" },
    { label: "地点", path: "bible/locations.md" },
    { label: "文风", path: "style/style-guide.md" },
    { label: "卷纲", path: "outline/volume-01.md" },
    { label: "伏笔", path: "ledger/foreshadowing.md" },
    { label: "连续性", path: "ledger/continuity.md" },
    { label: "升级节奏", path: "ledger/power-progression.md" }
  ];
  const currentSupportPath = ref(supportFiles[0].path);
  const supportContent = ref("");
  const savedSupportContent = ref("");
  const isLoading = ref(false);
  const error = ref("");

  const hasProject = computed(() => currentProject.value !== null);
  const openWorkspaceProjects = computed(() =>
    openWorkspaceSlugs.value
      .map((slug) => projects.value.find((project) => project.slug === slug))
      .filter((project): project is NovelProject => Boolean(project))
  );
  const hasUnsavedChanges = computed(() => currentContent.value !== savedContent.value);
  const currentDocumentLabel = computed(() => (currentDocumentKind.value === "content" ? "章节正文" : "章纲设定"));
  const currentSaveStateLabel = computed(() => {
    if (isSavingContent.value) return "保存中";
    if (hasUnsavedChanges.value) return "有未保存修改";
    if (lastSavedAt.value) return `已保存 ${lastSavedAt.value}`;
    return "已保存";
  });
  const hasUnsavedSupportChanges = computed(() => supportContent.value !== savedSupportContent.value);
  const canUseSelection = computed(() => Boolean(selection.value?.selectedText));
  const currentProjectAssets = computed(() => {
    if (!currentProject.value || !platformLibrary.value) return [];
    return platformLibrary.value.assets.filter((asset) => asset.linkedProjects.includes(currentProject.value!.slug));
  });

  function confirmDiscard(message: string) {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      return true;
    }

    return window.confirm(message);
  }

  function canLeaveCurrentChapter() {
    return (
      !hasUnsavedChanges.value ||
      confirmDiscard("当前章节有未保存内容，切换工作台会先保留在本次会话缓存中；刷新页面前仍建议保存。是否继续？")
    );
  }

  function canLeaveCurrentSupportFile() {
    return (
      !hasUnsavedSupportChanges.value ||
      confirmDiscard("当前资料文件有未保存内容，切换工作台会先保留在本次会话缓存中；刷新页面前仍建议保存。是否继续？")
    );
  }

  function canLeaveCurrentWorkspace() {
    return canLeaveCurrentChapter() && canLeaveCurrentSupportFile();
  }

  function countDraftWords(content: string) {
    return content.replace(/\s+/g, "").length;
  }

  function syncDashboardWordCount(content = currentContent.value) {
    if (!currentDashboard.value) return;
    currentDashboard.value = {
      ...currentDashboard.value,
      wordCount: countDraftWords(content),
      updatedAt: new Date().toISOString()
    };
  }

  function parseRecapCandidate(content?: string) {
    if (!content) return null;

    try {
      const parsed = JSON.parse(content) as Partial<WritingRecapCandidate>;
      if (!parsed || typeof parsed.summary !== "string" || !parsed.chapterId) return null;
      return {
        chapterId: parsed.chapterId,
        summary: parsed.summary,
        newFacts: Array.isArray(parsed.newFacts) ? parsed.newFacts : [],
        characterStateChanges: Array.isArray(parsed.characterStateChanges) ? parsed.characterStateChanges : [],
        foreshadowingUpdates: Array.isArray(parsed.foreshadowingUpdates) ? parsed.foreshadowingUpdates : [],
        continuityRisks: Array.isArray(parsed.continuityRisks) ? parsed.continuityRisks : [],
        powerProgressionUpdates: Array.isArray(parsed.powerProgressionUpdates) ? parsed.powerProgressionUpdates : [],
        createdAt: parsed.createdAt || new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  function mergeLedgerEntries(existing: LedgerEntry[], updates: LedgerEntry[]) {
    const merged = new Map(existing.map((entry) => [entry.id, entry]));
    updates.forEach((entry) => {
      merged.set(entry.id, {
        ...merged.get(entry.id),
        ...entry,
        updatedAt: entry.updatedAt || new Date().toISOString()
      });
    });
    return Array.from(merged.values());
  }

  function startTaskProgress() {
    taskProgress.value = [
      { id: "context", label: "准备项目上下文", status: "running" },
      { id: "codex", label: "调用 Codex CLI", status: "pending" },
      { id: "parse", label: "解析结构化结果", status: "pending" }
    ];
  }

  function setTaskProgress(id: string, status: TaskProgressStep["status"]) {
    taskProgress.value = taskProgress.value.map((step) => (step.id === id ? { ...step, status } : step));
  }

  function finishTaskProgress(success: boolean) {
    const fallbackStatus = success ? "done" : "error";
    taskProgress.value = taskProgress.value.map((step) => ({
      ...step,
      status: step.status === "done" ? "done" : fallbackStatus
    }));
  }

  function resetActiveWorkspace() {
    currentProject.value = null;
    currentChapter.value = null;
    currentDocumentKind.value = "content";
    currentFilePath.value = "";
    currentContent.value = "";
    savedContent.value = "";
    lastSavedAt.value = "";
    selection.value = null;
    rewriteCandidate.value = null;
    recapCandidate.value = null;
    currentDashboard.value = null;
    sceneCards.value = [];
    activeLedgerKind.value = "foreshadowing";
    ledgerEntries.value = [];
    writingMode.value = "structure";
    supportContent.value = "";
    savedSupportContent.value = "";
  }

  function cacheCurrentWorkspace() {
    if (!currentProject.value) return;

    workspaceCache.value = {
      ...workspaceCache.value,
      [currentProject.value.slug]: {
        project: currentProject.value,
        chapterId: currentChapter.value?.id || null,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        content: currentContent.value,
        savedContent: savedContent.value,
        lastSavedAt: lastSavedAt.value,
        selection: selection.value,
        currentTask: currentTask.value,
        taskProgress: taskProgress.value,
        taskHistory: taskHistory.value,
        rewriteCandidate: rewriteCandidate.value,
        recapCandidate: recapCandidate.value,
        dashboard: currentDashboard.value,
        sceneCards: sceneCards.value,
        ledgerKind: activeLedgerKind.value,
        ledgerEntries: ledgerEntries.value,
        writingMode: writingMode.value,
        supportPath: currentSupportPath.value,
        supportContent: supportContent.value,
        savedSupportContent: savedSupportContent.value
      }
    };
  }

  function restoreCachedWorkspace(project: NovelProject) {
    const cached = workspaceCache.value[project.slug];
    if (!cached) return false;

    currentProject.value = project;
    currentChapter.value = project.chapters.find((chapter) => chapter.id === cached.chapterId) || project.chapters[0] || null;
    currentDocumentKind.value = cached.documentKind;
    currentFilePath.value = cached.filePath;
    currentContent.value = cached.content;
    savedContent.value = cached.savedContent;
    lastSavedAt.value = cached.lastSavedAt;
    selection.value = cached.selection;
    currentTask.value = cached.currentTask;
    taskProgress.value = cached.taskProgress;
    taskHistory.value = cached.taskHistory;
    rewriteCandidate.value = cached.rewriteCandidate;
    recapCandidate.value = cached.recapCandidate;
    currentDashboard.value = cached.dashboard;
    sceneCards.value = cached.sceneCards;
    activeLedgerKind.value = cached.ledgerKind;
    ledgerEntries.value = cached.ledgerEntries;
    writingMode.value = cached.writingMode || "structure";
    currentSupportPath.value = cached.supportPath;
    supportContent.value = cached.supportContent;
    savedSupportContent.value = cached.savedSupportContent;
    return true;
  }

  async function loadProjects() {
    projects.value = await novelApi.listProjects();
    openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) =>
      projects.value.some((project) => project.slug === slug)
    );
  }

  async function loadPlatformLibrary() {
    platformLibrary.value = await novelApi.readPlatformLibrary();
  }

  async function createProject(input: { title?: string; genre?: string; roughIdea: string }) {
    if (!canLeaveCurrentWorkspace()) return;

    isLoading.value = true;
    error.value = "";
    try {
      const project = await novelApi.createProject(input);
      projects.value = [project, ...projects.value.filter((item) => item.slug !== project.slug)];
      await openProject(project);
      return project;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function importProject(input: { sourcePath: string; title?: string; genre?: string; roughIdea?: string }) {
    if (!canLeaveCurrentWorkspace()) return;

    isLoading.value = true;
    error.value = "";
    try {
      const project = await novelApi.importProject(input);
      projects.value = [project, ...projects.value.filter((item) => item.slug !== project.slug)];
      await openProject(project);
      return project;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function createSharedAsset(input: {
    name: string;
    type?: PlatformAssetType;
    tags?: string[];
    filePath?: string;
    projectSlug?: string;
  }) {
    const asset = await novelApi.createPlatformAsset({
      ...input,
      scope: "shared",
      projectSlug: input.projectSlug || currentProject.value?.slug
    });
    await loadPlatformLibrary();
    return asset;
  }

  async function linkSharedAsset(asset: PlatformAsset) {
    if (!currentProject.value) return;
    const linked = await novelApi.linkPlatformAsset(asset.id, currentProject.value.slug);
    if (platformLibrary.value) {
      platformLibrary.value = {
        ...platformLibrary.value,
        assets: platformLibrary.value.assets.map((item) => (item.id === linked.id ? linked : item))
      };
    } else {
      await loadPlatformLibrary();
    }
  }

  async function loadChapterCockpit(chapterId: string) {
    if (!currentProject.value) return;
    const [dashboard, cards] = await Promise.all([
      novelApi.readChapterDashboard(currentProject.value.slug, chapterId),
      novelApi.readSceneCards(currentProject.value.slug, chapterId)
    ]);
    currentDashboard.value = {
      ...dashboard,
      wordCount: countDraftWords(currentContent.value)
    };
    sceneCards.value = cards;
  }

  function updateDashboard(patch: Partial<ChapterDashboard>) {
    if (!currentDashboard.value) return;
    currentDashboard.value = {
      ...currentDashboard.value,
      ...patch,
      chapterId: currentDashboard.value.chapterId,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveCurrentDashboard() {
    if (!currentProject.value || !currentDashboard.value) return;
    isSavingDashboard.value = true;
    try {
      currentDashboard.value = await novelApi.saveChapterDashboard(currentProject.value.slug, currentDashboard.value);
    } finally {
      isSavingDashboard.value = false;
    }
  }

  function updateSceneCards(cards: SceneCard[]) {
    sceneCards.value = cards;
  }

  async function saveCurrentSceneCards() {
    if (!currentProject.value || !currentChapter.value) return;
    isSavingScenes.value = true;
    try {
      sceneCards.value = await novelApi.saveSceneCards(currentProject.value.slug, currentChapter.value.id, sceneCards.value);
    } finally {
      isSavingScenes.value = false;
    }
  }

  async function loadLedger(kind: LedgerKind = activeLedgerKind.value) {
    if (!currentProject.value) return;
    activeLedgerKind.value = kind;
    ledgerEntries.value = await novelApi.readLedgerEntries(currentProject.value.slug, kind);
  }

  async function saveLedger(kind: LedgerKind = activeLedgerKind.value, entries: LedgerEntry[] = ledgerEntries.value) {
    if (!currentProject.value) return;
    activeLedgerKind.value = kind;
    ledgerEntries.value = await novelApi.saveLedgerEntries(currentProject.value.slug, kind, entries);
  }

  function updateLedgerEntries(entries: LedgerEntry[]) {
    ledgerEntries.value = entries;
  }

  function setWritingMode(mode: WritingMode) {
    writingMode.value = mode;
  }

  async function requestWritingRecap() {
    await runTask("writing.recap");
  }

  async function acceptWritingRecap() {
    if (!currentProject.value || !recapCandidate.value) return;
    const updates = [
      ...recapCandidate.value.foreshadowingUpdates,
      ...recapCandidate.value.continuityRisks,
      ...recapCandidate.value.powerProgressionUpdates
    ];
    const updatesByKind = updates.reduce<Partial<Record<LedgerKind, LedgerEntry[]>>>((groups, entry) => {
      groups[entry.kind] = [...(groups[entry.kind] || []), entry];
      return groups;
    }, {});

    for (const [kind, entries] of Object.entries(updatesByKind) as Array<[LedgerKind, LedgerEntry[]]>) {
      const existing = kind === activeLedgerKind.value ? ledgerEntries.value : await novelApi.readLedgerEntries(currentProject.value.slug, kind);
      const saved = await novelApi.saveLedgerEntries(currentProject.value.slug, kind, mergeLedgerEntries(existing, entries));
      if (kind === activeLedgerKind.value) {
        ledgerEntries.value = saved;
      }
    }

    recapCandidate.value = null;
  }

  function rejectWritingRecap() {
    recapCandidate.value = null;
  }

  async function openProject(project: NovelProject, options: WorkspaceSwitchOptions = {}) {
    if (currentProject.value?.slug !== project.slug && !options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;

    cacheCurrentWorkspace();
    if (!openWorkspaceSlugs.value.includes(project.slug)) {
      openWorkspaceSlugs.value = [...openWorkspaceSlugs.value, project.slug];
    }

    if (restoreCachedWorkspace(project)) return;

    currentProject.value = project;
    currentDocumentKind.value = "content";
    const chapter = project.chapters.find((item) => item.id === project.lastOpenedChapterId) || project.chapters[0];
    if (chapter) {
      await openChapter(chapter, currentDocumentKind.value, { skipLeaveCheck: true });
    }
    await openSupportFile(currentSupportPath.value, { skipLeaveCheck: true });
    await loadLedger(activeLedgerKind.value);
  }

  function showProjectHub(options: WorkspaceSwitchOptions = {}) {
    if (!options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;
    cacheCurrentWorkspace();
    resetActiveWorkspace();
  }

  async function closeWorkspace(projectSlug: string, options: WorkspaceSwitchOptions = {}) {
    if (currentProject.value?.slug === projectSlug && !options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;

    openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) => slug !== projectSlug);
    const { [projectSlug]: _closedWorkspace, ...restCache } = workspaceCache.value;
    workspaceCache.value = restCache;
    if (currentProject.value?.slug !== projectSlug) return;

    const nextProject = openWorkspaceProjects.value[0];
    if (nextProject) {
      await openProject(nextProject, { skipLeaveCheck: true });
      return;
    }

    resetActiveWorkspace();
  }

  async function openChapter(
    chapter: NovelChapter,
    documentKind: ChapterDocumentKind = currentDocumentKind.value,
    options: WorkspaceSwitchOptions = {}
  ) {
    if (!currentProject.value) return;
    const nextFilePath = documentKind === "outline" ? chapter.outlinePath : chapter.contentPath;
    if (currentFilePath.value !== nextFilePath && !options.skipLeaveCheck && !canLeaveCurrentChapter()) return;

    currentChapter.value = chapter;
    currentDocumentKind.value = documentKind;
    currentFilePath.value = nextFilePath;
    const content = await novelApi.readFile(currentProject.value.slug, nextFilePath);
    currentContent.value = content;
    savedContent.value = content;
    lastSavedAt.value = "";
    selection.value = null;
    rewriteCandidate.value = null;
    recapCandidate.value = null;
    await loadChapterCockpit(chapter.id);
  }

  async function openChapterDocument(documentKind: ChapterDocumentKind) {
    if (!currentChapter.value) return;
    if (documentKind === currentDocumentKind.value) return;
    if (hasUnsavedChanges.value) {
      await saveCurrentContent();
    }
    await openChapter(currentChapter.value, documentKind);
  }

  function updateContent(content: string) {
    currentContent.value = content;
    syncDashboardWordCount(content);
  }

  function updateSelection(nextSelection: EditorSelection | null) {
    selection.value = nextSelection;
  }

  async function saveCurrentContent() {
    if (!currentProject.value || !currentFilePath.value) return;
    isSavingContent.value = true;
    error.value = "";
    try {
      await novelApi.saveFile(currentProject.value.slug, currentFilePath.value, currentContent.value);
      savedContent.value = currentContent.value;
      syncDashboardWordCount();
      await saveCurrentDashboard();
      lastSavedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isSavingContent.value = false;
    }
  }

  async function openSupportFile(filePath: string, options: WorkspaceSwitchOptions = {}) {
    if (!currentProject.value) return;
    if (currentSupportPath.value !== filePath && !options.skipLeaveCheck && !canLeaveCurrentSupportFile()) return;

    currentSupportPath.value = filePath;
    const content = await novelApi.readFile(currentProject.value.slug, filePath);
    supportContent.value = content;
    savedSupportContent.value = content;
  }

  function updateSupportContent(content: string) {
    supportContent.value = content;
  }

  async function saveSupportContent() {
    if (!currentProject.value || !currentSupportPath.value) return;
    await novelApi.saveFile(currentProject.value.slug, currentSupportPath.value, supportContent.value);
    savedSupportContent.value = supportContent.value;
  }

  async function runTask(type: CodexTaskType, payload: Record<string, unknown> = {}) {
    if (!currentProject.value) return;
    if (type === "chapter.plan") {
      await openChapterDocument("outline");
      if (currentDocumentKind.value !== "outline") return;
    }
    if (type === "chapter.draft") {
      await openChapterDocument("content");
      if (currentDocumentKind.value !== "content") return;
    }

    isLoading.value = true;
    error.value = "";
    startTaskProgress();
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const task = await novelApi.runTask(currentProject.value.slug, type, {
        chapterId: currentChapter.value?.id,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        ...payload
      });
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      taskHistory.value.unshift(task);
      if (task.result) {
        if (type === "writing.recap") {
          recapCandidate.value = parseRecapCandidate(task.result.content);
          rewriteCandidate.value = null;
        } else if (type !== "writing.briefing") {
          rewriteCandidate.value = task.result;
        }
      }
      setTaskProgress("parse", task.status === "error" ? "error" : "done");
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      finishTaskProgress(false);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function polishSelection(mode: string) {
    if (!currentProject.value || !currentChapter.value || !selection.value) return;
    isLoading.value = true;
    error.value = "";
    startTaskProgress();
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const task = await novelApi.polishSelection(currentProject.value.slug, {
        ...selection.value,
        chapterId: currentChapter.value.id,
        mode
      });
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      taskHistory.value.unshift(task);
      rewriteCandidate.value = task.result || null;
      setTaskProgress("parse", task.status === "error" ? "error" : "done");
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      finishTaskProgress(false);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  function acceptRewrite() {
    if (!selection.value || !rewriteCandidate.value?.content) return;
    currentContent.value = `${currentContent.value.slice(0, selection.value.start)}${rewriteCandidate.value.content}${currentContent.value.slice(selection.value.end)}`;
    savedContent.value = savedContent.value === currentContent.value ? currentContent.value : savedContent.value;
    syncDashboardWordCount();
    selection.value = null;
    rewriteCandidate.value = null;
  }

  function rejectRewrite() {
    rewriteCandidate.value = null;
  }

  async function applyTaskPatches() {
    if (!currentProject.value || !rewriteCandidate.value?.patches.length) return;
    if (!canLeaveCurrentChapter()) return;

    await novelApi.applyPatches(currentProject.value.slug, rewriteCandidate.value.patches);
    if (currentChapter.value) {
      await openChapter(currentChapter.value, currentDocumentKind.value);
    }
  }

  return {
    projects,
    openWorkspaceSlugs,
    openWorkspaceProjects,
    workspaceCache,
    currentProject,
    currentChapter,
    currentDocumentKind,
    currentDocumentLabel,
    currentSaveStateLabel,
    currentFilePath,
    currentContent,
    isSavingContent,
    selection,
    currentTask,
    taskProgress,
    taskHistory,
    rewriteCandidate,
    recapCandidate,
    currentDashboard,
    sceneCards,
    activeLedgerKind,
    ledgerEntries,
    writingMode,
    isSavingDashboard,
    isSavingScenes,
    platformLibrary,
    supportFiles,
    currentSupportPath,
    supportContent,
    isLoading,
    error,
    hasProject,
    hasUnsavedChanges,
    hasUnsavedSupportChanges,
    canUseSelection,
    currentProjectAssets,
    canLeaveCurrentWorkspace,
    loadProjects,
    loadPlatformLibrary,
    createProject,
    importProject,
    createSharedAsset,
    linkSharedAsset,
    loadChapterCockpit,
    updateDashboard,
    saveCurrentDashboard,
    updateSceneCards,
    saveCurrentSceneCards,
    loadLedger,
    saveLedger,
    updateLedgerEntries,
    setWritingMode,
    requestWritingRecap,
    acceptWritingRecap,
    rejectWritingRecap,
    openProject,
    showProjectHub,
    closeWorkspace,
    openChapter,
    openChapterDocument,
    updateContent,
    updateSelection,
    saveCurrentContent,
    openSupportFile,
    updateSupportContent,
    saveSupportContent,
    runTask,
    polishSelection,
    acceptRewrite,
    rejectRewrite,
    applyTaskPatches
  };
});
