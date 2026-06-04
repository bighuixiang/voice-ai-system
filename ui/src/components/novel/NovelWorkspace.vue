<template>
  <div class="novel-workspace">
    <header class="workspace-header">
      <div>
        <h1>创作生产平台</h1>
        <p>从小说项目开始，逐步扩展到素材、剧本、图片和视频生成管理。</p>
      </div>
      <div class="header-actions">
        <el-button v-if="isProjectRoute" @click="goProjectHub">
          <el-icon><Folder /></el-icon>
          项目大厅
        </el-button>
        <el-button :loading="store.isLoading" @click="store.loadProjects">
          <el-icon><Refresh /></el-icon>
          刷新项目
        </el-button>
      </div>
    </header>

    <nav v-if="store.openWorkspaceProjects.length" class="workspace-tabs" aria-label="已打开工作台">
      <button
        v-for="project in store.openWorkspaceProjects"
        :key="project.slug"
        class="workspace-tab"
        :class="{ active: store.currentProject?.slug === project.slug }"
        type="button"
        @click="goWorkspace(project.slug)"
      >
        <span>{{ project.title }}</span>
        <el-button circle size="small" aria-label="关闭工作台" @click.stop="closeWorkspace(project.slug)">
          <el-icon><Close /></el-icon>
        </el-button>
      </button>
    </nav>

    <main v-if="!isProjectRoute" class="project-hub">
      <section class="hub-copy" aria-labelledby="hub-title">
        <p class="eyebrow">Creative Production Platform</p>
        <h2 id="hub-title">先选项目，再进入工作台</h2>
        <p>MVP 先把小说创作跑通；项目结构已经为素材、剧本、图片生成和视频生成预留模块。</p>
        <div class="module-strip" aria-label="平台模块">
          <span>小说创作</span>
          <span>素材管理</span>
          <span>剧本生产</span>
          <span>图片生成</span>
          <span>视频生成</span>
        </div>
      </section>

      <div class="hub-grid">
        <ProjectManagerPanel
          :projects="store.projects"
          :current-project="store.currentProject"
          :loading="store.isLoading"
          @refresh="store.loadProjects"
          @open="goWorkspace($event.slug)"
          @import-project="importProjectAndOpen"
        />
        <ProjectCreatePanel @created="goWorkspace($event.slug)" />
        <PlatformLibraryPanel
          :library="store.platformLibrary"
          :loading="store.isLoading"
          @refresh="store.loadPlatformLibrary"
          @create-asset="store.createSharedAsset"
          @link-asset="store.linkSharedAsset"
        />
      </div>
    </main>

    <main v-else-if="store.hasProject" class="workspace-grid" :class="`mode-${store.writingMode}`">
      <aside v-if="store.writingMode !== 'focus'" class="left-rail">
        <ChapterTree
          v-if="store.currentProject"
          :project="store.currentProject"
          :active-chapter-id="store.currentChapter?.id"
          @open="store.openChapter"
        />
      </aside>

      <section class="center-stage">
        <WritingModeSwitcher :mode="store.writingMode" @update:mode="store.setWritingMode" />
        <FocusWritingPanel
          v-if="store.writingMode === 'focus'"
          :guide="store.focusWritingGuide"
          @update-target="store.updateFocusTargetWords"
          @open-structure="store.setWritingMode('structure')"
          @open-review="store.setWritingMode('review')"
        />
        <StructureQuickStartPanel
          v-if="store.writingMode === 'structure'"
          :idea="store.structureIdeaInput"
          :can-reverse-engineer="store.canReverseEngineerStructure"
          :can-save-structure="Boolean(store.currentDashboard)"
          :is-saving="store.isSavingDashboard || store.isSavingScenes"
          @update:idea="store.updateStructureIdeaInput"
          @reverse-from-draft="store.reverseEngineerStructureFromDraft"
          @generate-from-idea="store.generateStructureFromIdea"
          @save-structure="handleSaveCurrentStructure"
        />
        <ChapterDashboardPanel
          v-if="store.writingMode === 'structure'"
          :dashboard="store.currentDashboard"
          :is-saving="store.isSavingDashboard"
          :revision="store.structureDraftVersion"
          @update:dashboard="store.updateDashboard"
          @save="store.saveCurrentDashboard"
        />
        <SceneCardPanel
          v-if="store.writingMode === 'structure'"
          :cards="store.sceneCards"
          :is-saving="store.isSavingScenes"
          :revision="store.structureDraftVersion"
          @update:cards="store.updateSceneCards"
          @save="store.saveCurrentSceneCards"
        />
        <ChapterEditor
          class="editor-area"
          :chapter="store.currentChapter"
          :document-kind="store.currentDocumentKind"
          :document-label="store.currentDocumentLabel"
          :file-path="store.currentFilePath"
          :content="store.currentContent"
          :has-unsaved-changes="store.hasUnsavedChanges"
          :save-state-label="store.currentSaveStateLabel"
          :is-saving="store.isSavingContent"
          :word-count="editorWordCount"
          @update:content="store.updateContent"
          @switch-document="store.openChapterDocument"
          @selection="store.updateSelection"
          @save="handleSaveCurrentContent"
        />
      </section>

      <aside v-if="store.writingMode !== 'focus'" class="right-rail">
        <SelectionToolbar
          v-if="store.writingMode === 'review'"
          :selection="store.selection"
          :loading="store.isLoading"
          @polish="store.polishSelection"
        />
        <ReviewQualityPanel
          v-if="store.writingMode === 'review'"
          :report="store.currentQualityReport"
          :selected-tone="store.styleTone"
          :can-diagnose="store.canDiagnoseChapter"
          :can-tune-selection="store.canTuneSelection"
          @diagnose="store.diagnoseCurrentChapter"
          @update:tone="store.updateStyleTone"
          @tune-selection="store.tuneSelectionStyle"
        />
        <RewriteComparison
          v-if="store.writingMode === 'review'"
          :result="store.rewriteCandidate"
          :original-text="store.selection?.selectedText"
          @accept="store.acceptRewrite"
          @reject="store.rejectRewrite"
          @apply-patches="store.applyTaskPatches"
        />
        <AIOperationPanel
          v-if="store.writingMode === 'structure'"
          :task="store.currentTask"
          :progress="store.taskProgress"
          :loading="store.isLoading"
          @run-task="store.runTask"
          @apply-patches="store.applyTaskPatches"
        />
        <WritingRecapPanel
          v-if="store.writingMode === 'review'"
          :candidate="store.recapCandidate"
          @accept="store.acceptWritingRecap"
          @reject="store.rejectWritingRecap"
        />
        <TaskHistoryPanel v-if="store.writingMode === 'review'" :tasks="store.taskHistory" />
        <ContextPanel v-if="store.writingMode === 'structure'" :project="store.currentProject" :chapter="store.currentChapter" />
        <PlatformLibraryPanel
          v-if="store.writingMode === 'structure'"
          :library="store.platformLibrary"
          :project-slug="store.currentProject?.slug"
          :loading="store.isLoading"
          @refresh="store.loadPlatformLibrary"
          @create-asset="store.createSharedAsset"
          @link-asset="store.linkSharedAsset"
        />
        <SupportFilePanel
          v-if="store.writingMode === 'structure'"
          :files="store.supportFiles"
          :current-path="store.currentSupportPath"
          :content="store.supportContent"
          :has-unsaved-changes="store.hasUnsavedSupportChanges"
          @open="store.openSupportFile"
          @update:content="store.updateSupportContent"
          @save="store.saveSupportContent"
        />
        <LedgerPanel
          v-if="store.writingMode === 'review'"
          :entries="store.ledgerEntries"
          :active-kind="store.activeLedgerKind"
          :loading="store.isLoading"
          @change-kind="store.loadLedger"
          @update:entries="store.updateLedgerEntries"
          @save="store.saveLedger"
        />
        <div v-if="store.error" class="workspace-error" role="alert">{{ store.error }}</div>
      </aside>
    </main>
    <main v-else class="workspace-loading" aria-live="polite">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ store.error || "正在载入工作台" }}</span>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";
import { Close, Folder, Loading, Refresh } from "@element-plus/icons-vue";
import { useRoute, useRouter } from "vue-router";
import { useNovelStore } from "@/stores/novel";
import ProjectManagerPanel from "./ProjectManagerPanel.vue";
import ProjectCreatePanel from "./ProjectCreatePanel.vue";
import ChapterTree from "./ChapterTree.vue";
import FocusWritingPanel from "./FocusWritingPanel.vue";
import StructureQuickStartPanel from "./StructureQuickStartPanel.vue";
import ChapterDashboardPanel from "./ChapterDashboardPanel.vue";
import SceneCardPanel from "./SceneCardPanel.vue";
import ChapterEditor from "./ChapterEditor.vue";
import SelectionToolbar from "./SelectionToolbar.vue";
import ReviewQualityPanel from "./ReviewQualityPanel.vue";
import RewriteComparison from "./RewriteComparison.vue";
import AIOperationPanel from "./AIOperationPanel.vue";
import WritingRecapPanel from "./WritingRecapPanel.vue";
import WritingModeSwitcher from "./WritingModeSwitcher.vue";
import TaskHistoryPanel from "./TaskHistoryPanel.vue";
import ContextPanel from "./ContextPanel.vue";
import SupportFilePanel from "./SupportFilePanel.vue";
import LedgerPanel from "./LedgerPanel.vue";
import PlatformLibraryPanel from "./PlatformLibraryPanel.vue";

defineOptions({
  name: "NovelWorkspace"
});

const store = useNovelStore();
const route = useRoute();
const router = useRouter();
const isProjectRoute = computed(() => route.name === "project-workspace");
const editorWordCount = computed(() => store.currentDashboard?.wordCount ?? store.currentContent.replace(/\s+/g, "").length);

function routeProjectSlug() {
  const slug = route.params.slug;
  return typeof slug === "string" ? slug : "";
}

async function syncWorkspaceFromRoute() {
  if (!store.projects.length) {
    await store.loadProjects();
  }
  await store.loadPlatformLibrary().catch(() => {
    // Platform library is optional until the API service is running.
  });

  if (!isProjectRoute.value) {
    store.showProjectHub({ skipLeaveCheck: true });
    return;
  }

  const slug = routeProjectSlug();
  const project = store.projects.find((item) => item.slug === slug);
  if (!project) {
    store.error = `找不到项目：${slug}`;
    await router.replace({ name: "project-hub" });
    return;
  }

  await store.openProject(project, { skipLeaveCheck: true });
}

function goProjectHub() {
  router.push({ name: "project-hub" });
}

function goWorkspace(projectSlug: string) {
  router.push({ name: "project-workspace", params: { slug: projectSlug } });
}

async function importProjectAndOpen(input: { sourcePath: string; title?: string; genre?: string }) {
  const project = await store.importProject(input);
  if (project) {
    goWorkspace(project.slug);
  }
}

async function closeWorkspace(projectSlug: string) {
  await store.closeWorkspace(projectSlug);
  const nextProject = store.currentProject;
  if (nextProject) {
    goWorkspace(nextProject.slug);
    return;
  }

  goProjectHub();
}

async function handleSaveCurrentContent() {
  const hadChanges = store.hasUnsavedChanges;
  try {
    await store.saveCurrentContent();
    ElMessage.success(hadChanges ? "当前文档已保存" : "当前文档已是最新");
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "保存失败");
  }
}

async function handleSaveCurrentStructure() {
  try {
    await store.saveCurrentStructure();
    ElMessage.success("章节结构已保存");
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "保存结构失败");
  }
}

onMounted(() => {
  syncWorkspaceFromRoute().catch(() => {
    // Initial load can fail if the API service has not been started yet.
  });
});

watch(
  () => route.fullPath,
  () => {
    syncWorkspaceFromRoute().catch(() => {
      // Keep the cached workspace visible if the API is temporarily unavailable.
    });
  }
);
</script>

<style scoped lang="scss">
.novel-workspace {
  min-height: 100vh;
  background: #f3f5f8;
  color: #111827;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 72px;
  padding: 14px 20px;
  border-bottom: 1px solid #d8dee8;
  background: #ffffff;

  h1 {
    font-size: 20px;
    margin: 0 0 4px;
  }

  p {
    margin: 0;
    color: #6b7280;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 14px;
  border-bottom: 1px solid #d8dee8;
  background: #ffffff;
  overflow-x: auto;
}

.workspace-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  padding: 4px 4px 4px 10px;
  border: 1px solid #d8dee8;
  border-radius: 7px;
  background: #f8fafc;
  color: #374151;
  cursor: pointer;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.active {
    border-color: #2563eb;
    background: #eff6ff;
    color: #1d4ed8;
  }
}

.project-hub {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 16px;
  min-height: calc(100vh - 116px);
  padding: 24px;
}

.hub-copy {
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;

  .eyebrow {
    margin: 0 0 6px;
    color: #2563eb;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 26px;
  }

  p {
    max-width: 720px;
    margin: 0;
    color: #4b5563;
  }
}

.module-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;

  span {
    padding: 5px 9px;
    border: 1px solid #d8dee8;
    border-radius: 6px;
    background: #ffffff;
    color: #374151;
    font-size: 12px;
  }
}

.hub-grid {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(360px, 620px) minmax(300px, 380px);
  align-items: start;
  justify-content: center;
  gap: 16px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(420px, 1fr) minmax(300px, 380px);
  gap: 14px;
  height: calc(100vh - 116px);
  padding: 14px;

  &.mode-focus {
    grid-template-columns: minmax(0, 980px);
    justify-content: center;
  }

  &.mode-review {
    grid-template-columns: minmax(220px, 280px) minmax(420px, 1fr) minmax(320px, 420px);
  }
}

.left-rail,
.right-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}

.center-stage {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.center-stage > :not(.editor-area) {
  flex: 0 0 auto;
}

.editor-area {
  min-height: 560px;
  flex: 1 0 560px;
}

.mode-focus .editor-area {
  min-height: 0;
  flex: 1 1 auto;
}

.workspace-error {
  padding: 10px;
  border-radius: 6px;
  background: #fef2f2;
  color: #991b1b;
}

.workspace-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: calc(100vh - 116px);
  color: #475569;
}

@media (max-width: 1100px) {
  .workspace-grid {
    grid-template-columns: 260px minmax(420px, 1fr);
  }

  .right-rail {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .project-hub {
    min-height: auto;
    padding: 16px;
  }

  .hub-grid,
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .workspace-grid {
    height: auto;
  }

  .right-rail {
    display: flex;
  }
}
</style>
