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

    <el-form class="free-task" label-position="top" @submit.prevent="submitFreeTask">
      <el-form-item label="随时交给 AI">
        <el-input
          v-model="freePrompt"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="例如：检查这一章的升级节奏，或帮我补一个更合理的转折。"
        />
      </el-form-item>
      <el-button class="free-task-button" :loading="loading" @click="submitFreeTask">
        <el-icon><MagicStick /></el-icon>
        执行指令
      </el-button>
    </el-form>

    <ol v-if="progress.length" class="task-progress" aria-label="AI 执行进度">
      <li v-for="step in progress" :key="step.id" :class="step.status">
        <span class="progress-dot" />
        <span>{{ step.label }}</span>
      </li>
    </ol>

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
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { Collection, DataAnalysis, Edit, Finished, MagicStick } from "@element-plus/icons-vue";
import type { CodexTaskType, NovelTask, TaskProgressStep } from "@/types/novel";

defineProps<{
  task: NovelTask | null;
  progress: TaskProgressStep[];
  loading: boolean;
}>();

const emit = defineEmits<{
  "run-task": [type: CodexTaskType, payload?: Record<string, unknown>];
  "apply-patches": [];
}>();

const freePrompt = ref("");

function submitFreeTask() {
  const prompt = freePrompt.value.trim();
  if (!prompt) {
    ElMessage.warning("先写一句要交给 AI 的任务。");
    return;
  }

  emit("run-task", "assistant.free", { instruction: prompt });
}

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

.free-task {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.free-task-button {
  width: 100%;
}

.task-progress {
  display: grid;
  gap: 6px;
  padding: 10px;
  margin: 12px 0 0;
  list-style: none;
  border-radius: 6px;
  background: #f8fafc;

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #6b7280;
    font-size: 13px;
  }

  .running {
    color: #1d4ed8;
  }

  .done {
    color: #047857;
  }

  .error {
    color: #b91c1c;
  }
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
  flex: 0 0 auto;
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
