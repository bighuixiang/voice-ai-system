import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { novelApi } from "@/services/novelApi";
import type {
  CodexTaskResult,
  CodexTaskType,
  ChapterDocumentKind,
  EditorSelection,
  NovelChapter,
  NovelProject,
  NovelTask,
  PlatformAsset,
  PlatformAssetType,
  PlatformLibrary,
  TaskProgressStep
} from "@/types/novel";

export const useNovelStore = defineStore("novel", () => {
  const projects = ref<NovelProject[]>([]);
  const openWorkspaceSlugs = ref<string[]>([]);
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
      confirmDiscard("当前章节有未保存内容，继续切换会丢失这些修改。是否继续？")
    );
  }

  function canLeaveCurrentSupportFile() {
    return (
      !hasUnsavedSupportChanges.value ||
      confirmDiscard("当前资料文件有未保存内容，继续切换会丢失这些修改。是否继续？")
    );
  }

  function canLeaveCurrentWorkspace() {
    return canLeaveCurrentChapter() && canLeaveCurrentSupportFile();
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
    supportContent.value = "";
    savedSupportContent.value = "";
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

  async function openProject(project: NovelProject) {
    if (currentProject.value?.slug !== project.slug && !canLeaveCurrentWorkspace()) return;

    if (!openWorkspaceSlugs.value.includes(project.slug)) {
      openWorkspaceSlugs.value = [...openWorkspaceSlugs.value, project.slug];
    }
    currentProject.value = project;
    currentDocumentKind.value = "content";
    const chapter = project.chapters.find((item) => item.id === project.lastOpenedChapterId) || project.chapters[0];
    if (chapter) {
      await openChapter(chapter);
    }
    await openSupportFile(currentSupportPath.value);
  }

  function showProjectHub() {
    if (!canLeaveCurrentWorkspace()) return;
    resetActiveWorkspace();
  }

  async function closeWorkspace(projectSlug: string) {
    if (currentProject.value?.slug === projectSlug && !canLeaveCurrentWorkspace()) return;

    openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) => slug !== projectSlug);
    if (currentProject.value?.slug !== projectSlug) return;

    const nextProject = openWorkspaceProjects.value[0];
    if (nextProject) {
      await openProject(nextProject);
      return;
    }

    resetActiveWorkspace();
  }

  async function openChapter(chapter: NovelChapter, documentKind: ChapterDocumentKind = currentDocumentKind.value) {
    if (!currentProject.value) return;
    const nextFilePath = documentKind === "outline" ? chapter.outlinePath : chapter.contentPath;
    if (currentFilePath.value !== nextFilePath && !canLeaveCurrentChapter()) return;

    currentChapter.value = chapter;
    currentDocumentKind.value = documentKind;
    currentFilePath.value = nextFilePath;
    const content = await novelApi.readFile(currentProject.value.slug, nextFilePath);
    currentContent.value = content;
    savedContent.value = content;
    lastSavedAt.value = "";
    selection.value = null;
    rewriteCandidate.value = null;
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
      lastSavedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isSavingContent.value = false;
    }
  }

  async function openSupportFile(filePath: string) {
    if (!currentProject.value) return;
    if (currentSupportPath.value !== filePath && !canLeaveCurrentSupportFile()) return;

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
        rewriteCandidate.value = task.result;
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
    loadProjects,
    loadPlatformLibrary,
    createProject,
    importProject,
    createSharedAsset,
    linkSharedAsset,
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
