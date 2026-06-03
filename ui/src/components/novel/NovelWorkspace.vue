<template>
  <div class="novel-workspace">
    <header class="workspace-header">
      <div>
        <h1>小说 Codex 创作工作台</h1>
        <p>故事圣经、大纲、章节、润色和连续性检查集中在一个工作界面里。</p>
      </div>
      <el-button :loading="store.isLoading" @click="store.loadProjects">
        <el-icon><Refresh /></el-icon>
        刷新项目
      </el-button>
    </header>

    <main v-if="!store.hasProject" class="empty-state">
      <ProjectCreatePanel />
    </main>

    <main v-else class="workspace-grid">
      <aside class="left-rail">
        <ProjectCreatePanel />
        <ChapterTree
          v-if="store.currentProject"
          :project="store.currentProject"
          :active-chapter-id="store.currentChapter?.id"
          @open="store.openChapter"
        />
      </aside>

      <ChapterEditor
        class="editor-area"
        :chapter="store.currentChapter"
        :file-path="store.currentFilePath"
        :content="store.currentContent"
        :has-unsaved-changes="store.hasUnsavedChanges"
        @update:content="store.updateContent"
        @selection="store.updateSelection"
        @save="store.saveCurrentContent"
      />

      <aside class="right-rail">
        <SelectionToolbar :selection="store.selection" :loading="store.isLoading" @polish="store.polishSelection" />
        <RewriteComparison
          :result="store.rewriteCandidate"
          @accept="store.acceptRewrite"
          @reject="store.rejectRewrite"
          @apply-patches="store.applyTaskPatches"
        />
        <AIOperationPanel
          :task="store.currentTask"
          :loading="store.isLoading"
          @run-task="store.runTask"
          @apply-patches="store.applyTaskPatches"
        />
        <TaskHistoryPanel :tasks="store.taskHistory" />
        <ContextPanel :project="store.currentProject" :chapter="store.currentChapter" />
        <SupportFilePanel
          :files="store.supportFiles"
          :current-path="store.currentSupportPath"
          :content="store.supportContent"
          :has-unsaved-changes="store.hasUnsavedSupportChanges"
          @open="store.openSupportFile"
          @update:content="store.updateSupportContent"
          @save="store.saveSupportContent"
        />
        <LedgerPanel />
        <div v-if="store.error" class="workspace-error" role="alert">{{ store.error }}</div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import { useNovelStore } from "@/stores/novel";
import ProjectCreatePanel from "./ProjectCreatePanel.vue";
import ChapterTree from "./ChapterTree.vue";
import ChapterEditor from "./ChapterEditor.vue";
import SelectionToolbar from "./SelectionToolbar.vue";
import RewriteComparison from "./RewriteComparison.vue";
import AIOperationPanel from "./AIOperationPanel.vue";
import TaskHistoryPanel from "./TaskHistoryPanel.vue";
import ContextPanel from "./ContextPanel.vue";
import SupportFilePanel from "./SupportFilePanel.vue";
import LedgerPanel from "./LedgerPanel.vue";

const store = useNovelStore();

onMounted(() => {
  store.loadProjects().catch(() => {
    // The visible error is set by explicit actions; initial load can fail if API is not started.
  });
});
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

.empty-state {
  display: grid;
  place-items: center;
  min-height: calc(100vh - 72px);
  padding: 24px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(420px, 1fr) minmax(300px, 380px);
  gap: 14px;
  height: calc(100vh - 72px);
  padding: 14px;
}

.left-rail,
.right-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}

.left-rail :deep(.project-create) {
  padding: 16px;

  .intro h2 {
    font-size: 18px;
  }
}

.editor-area {
  min-height: 0;
}

.workspace-error {
  padding: 10px;
  border-radius: 6px;
  background: #fef2f2;
  color: #991b1b;
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

  .workspace-grid {
    height: auto;
    grid-template-columns: 1fr;
  }

  .right-rail {
    display: flex;
  }
}
</style>
