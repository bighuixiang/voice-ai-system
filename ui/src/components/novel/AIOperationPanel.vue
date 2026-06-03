<template>
  <section class="ai-panel" aria-label="AI 操作">
    <div class="panel-title">
      <span>AI 操作</span>
      <el-tag v-if="task" size="small" :type="task.status === 'success' ? 'success' : task.status === 'error' ? 'danger' : 'info'">
        {{ task.status }}
      </el-tag>
    </div>

    <div class="action-grid">
      <el-button v-for="action in actions" :key="action.type" :loading="loading" @click="$emit('run-task', action.type)">
        <el-icon><component :is="action.icon" /></el-icon>
        {{ action.label }}
      </el-button>
    </div>

    <div v-if="task?.error" class="task-error" role="alert">{{ task.error }}</div>

    <div v-if="task?.result" class="task-result">
      <strong>{{ task.result.summary }}</strong>
      <p>{{ task.result.content }}</p>
      <el-button v-if="task.result.patches.length" size="small" type="success" @click="$emit('apply-patches')">
        应用 {{ task.result.patches.length }} 个补丁
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Collection, DataAnalysis, Edit, Finished, MagicStick } from "@element-plus/icons-vue";
import type { CodexTaskType, NovelTask } from "@/types/novel";

defineProps<{
  task: NovelTask | null;
  loading: boolean;
}>();

defineEmits<{
  "run-task": [type: CodexTaskType];
  "apply-patches": [];
}>();

const actions: Array<{ type: CodexTaskType; label: string; icon: unknown }> = [
  { type: "outline.generate", label: "生成大纲", icon: Collection },
  { type: "chapter.plan", label: "规划章节", icon: DataAnalysis },
  { type: "chapter.draft", label: "起草正文", icon: Edit },
  { type: "idea.suggest", label: "补灵感", icon: MagicStick },
  { type: "continuity.check", label: "连续性检查", icon: Finished }
];
</script>

<style scoped lang="scss">
.ai-panel {
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  margin-bottom: 10px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.task-error,
.task-result {
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
}

.task-error {
  background: #fef2f2;
  color: #991b1b;
}

.task-result {
  background: #f9fafb;
  color: #374151;

  p {
    white-space: pre-wrap;
    max-height: 180px;
    overflow: auto;
    margin: 8px 0;
  }
}
</style>
