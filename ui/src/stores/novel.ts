import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { novelApi } from "@/services/novelApi";
import type { CodexTaskResult, CodexTaskType, EditorSelection, NovelChapter, NovelProject, NovelTask } from "@/types/novel";

export const useNovelStore = defineStore("novel", () => {
  const projects = ref<NovelProject[]>([]);
  const currentProject = ref<NovelProject | null>(null);
  const currentChapter = ref<NovelChapter | null>(null);
  const currentFilePath = ref("");
  const currentContent = ref("");
  const savedContent = ref("");
  const selection = ref<EditorSelection | null>(null);
  const currentTask = ref<NovelTask | null>(null);
  const taskHistory = ref<NovelTask[]>([]);
  const rewriteCandidate = ref<CodexTaskResult | null>(null);
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
  const hasUnsavedChanges = computed(() => currentContent.value !== savedContent.value);
  const hasUnsavedSupportChanges = computed(() => supportContent.value !== savedSupportContent.value);
  const canUseSelection = computed(() => Boolean(selection.value?.selectedText));

  async function loadProjects() {
    projects.value = await novelApi.listProjects();
    if (!currentProject.value && projects.value.length > 0) {
      await openProject(projects.value[0]);
    }
  }

  async function createProject(input: { title?: string; genre?: string; roughIdea: string }) {
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

  async function openProject(project: NovelProject) {
    currentProject.value = project;
    const chapter = project.chapters.find((item) => item.id === project.lastOpenedChapterId) || project.chapters[0];
    if (chapter) {
      await openChapter(chapter);
    }
    await openSupportFile(currentSupportPath.value);
  }

  async function openChapter(chapter: NovelChapter) {
    if (!currentProject.value) return;
    currentChapter.value = chapter;
    currentFilePath.value = chapter.contentPath;
    const content = await novelApi.readFile(currentProject.value.slug, chapter.contentPath);
    currentContent.value = content;
    savedContent.value = content;
    selection.value = null;
    rewriteCandidate.value = null;
  }

  function updateContent(content: string) {
    currentContent.value = content;
  }

  function updateSelection(nextSelection: EditorSelection | null) {
    selection.value = nextSelection;
  }

  async function saveCurrentContent() {
    if (!currentProject.value || !currentFilePath.value) return;
    await novelApi.saveFile(currentProject.value.slug, currentFilePath.value, currentContent.value);
    savedContent.value = currentContent.value;
  }

  async function openSupportFile(filePath: string) {
    if (!currentProject.value) return;
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
    isLoading.value = true;
    error.value = "";
    try {
      const task = await novelApi.runTask(currentProject.value.slug, type, {
        chapterId: currentChapter.value?.id,
        filePath: currentFilePath.value,
        ...payload
      });
      currentTask.value = task;
      taskHistory.value.unshift(task);
      if (task.result) {
        rewriteCandidate.value = task.result;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function polishSelection(mode: string) {
    if (!currentProject.value || !currentChapter.value || !selection.value) return;
    isLoading.value = true;
    error.value = "";
    try {
      const task = await novelApi.polishSelection(currentProject.value.slug, {
        ...selection.value,
        chapterId: currentChapter.value.id,
        mode
      });
      currentTask.value = task;
      taskHistory.value.unshift(task);
      rewriteCandidate.value = task.result || null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
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
    await novelApi.applyPatches(currentProject.value.slug, rewriteCandidate.value.patches);
    if (currentChapter.value) {
      await openChapter(currentChapter.value);
    }
  }

  return {
    projects,
    currentProject,
    currentChapter,
    currentFilePath,
    currentContent,
    selection,
    currentTask,
    taskHistory,
    rewriteCandidate,
    supportFiles,
    currentSupportPath,
    supportContent,
    isLoading,
    error,
    hasProject,
    hasUnsavedChanges,
    hasUnsavedSupportChanges,
    canUseSelection,
    loadProjects,
    createProject,
    openProject,
    openChapter,
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
