<template>
  <section class="ai-panel" aria-label="AI 操作">
    <div class="panel-title">
      <span>AI 操作</span>
      <div class="panel-title-actions">
        <el-button v-if="canCancelTask" size="small" type="danger" plain @click="$emit('cancel-task')">
          <el-icon><CircleClose /></el-icon>
          鍙栨秷
        </el-button>
        <el-tag v-if="task" size="small" :type="task.status === 'success' ? 'success' : task.status === 'error' || task.status === 'cancelled' ? 'danger' : 'info'">
          {{ task.status }}
        </el-tag>
      </div>
    </div>

    <div class="action-grid">
      <el-button
        v-for="(action, index) in actions"
        :key="action.type"
        class="action-button"
        :class="{ 'action-button--centered': isLastOddAction(index) }"
        :loading="loading"
        @click="$emit('run-task', action.type)"
      >
        <el-icon><component :is="action.icon" /></el-icon>
        <span class="action-content">
          <span class="action-label">{{ action.label }}</span>
          <span v-if="stageForTask(action.type)" class="action-stage">
            {{ stageForTask(action.type)?.label }}
            <small>{{ stageForTask(action.type)?.key }}</small>
          </span>
        </span>
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

    <div v-if="progress.length" class="task-progress-wrap">
      <div v-if="activeStage" class="progress-stage">
        <span>{{ activeStage.label }}</span>
        <small>{{ activeStage.key }}</small>
      </div>
      <ol class="task-progress" aria-label="AI 执行进度">
        <li v-for="step in progress" :key="step.id" :class="step.status">
          <span class="progress-dot" />
          <span>{{ step.label }}</span>
        </li>
      </ol>
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
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { CircleClose, Collection, DataAnalysis, Edit, Finished, MagicStick } from "@element-plus/icons-vue";
import type { AiStageDefinition, CodexTaskType, NovelTask, TaskProgressStep } from "@/types/novel";

const props = defineProps<{
  task: NovelTask | null;
  activeTaskType?: CodexTaskType | null;
  progress: TaskProgressStep[];
  loading: boolean;
  stages?: AiStageDefinition[];
}>();

const emit = defineEmits<{
  "run-task": [type: CodexTaskType, payload?: Record<string, unknown>];
  "apply-patches": [];
  "cancel-task": [];
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
  { type: "writing.briefing", label: "写前简报", icon: DataAnalysis },
  { type: "writing.recap", label: "写后复盘", icon: Finished },
  { type: "idea.suggest", label: "补灵感", icon: MagicStick },
  { type: "continuity.check", label: "连续性检查", icon: Finished }
];

const stageByTaskType = computed(() => {
  const entries = new Map<CodexTaskType, AiStageDefinition>();
  for (const stage of props.stages || []) {
    for (const taskType of stage.taskTypes) {
      entries.set(taskType, stage);
    }
  }
  return entries;
});

function stageForTask(type: CodexTaskType) {
  return stageByTaskType.value.get(type);
}

const activeStage = computed(() => {
  const taskType = props.activeTaskType || props.task?.type;
  return taskType ? stageByTaskType.value.get(taskType) : undefined;
});

const canCancelTask = computed(() => props.loading && props.task?.status === "running");

function isLastOddAction(index: number) {
  return actions.length % 2 === 1 && index === actions.length - 1;
}
</script>

<style scoped lang="scss">
.ai-panel {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  margin-bottom: 10px;
}

.panel-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}

.action-button {
  width: 100%;
  min-width: 0;
  min-height: 58px;
  justify-content: flex-start;
  white-space: normal;
  text-align: left;
}

.action-content {
  display: grid;
  min-width: 0;
  gap: 2px;
  line-height: 1.25;
}

.action-label {
  font-weight: 600;
}

.action-stage {
  display: grid;
  gap: 1px;
  color: var(--app-text-muted);
  font-size: 12px;

  small {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 11px;
    line-height: 1.2;
  }
}

.action-button--centered {
  grid-column: 1 / -1;
  justify-self: center;
  width: calc((100% - 8px) / 2);
}

.free-task {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
}

.free-task-button {
  width: 100%;
}

.task-progress-wrap {
  margin: 12px 0 0;
  border-radius: 6px;
  background: var(--app-bg-soft);
  overflow: hidden;
}

.progress-stage {
  display: grid;
  gap: 2px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text-secondary);
  font-size: 13px;

  span {
    font-weight: 700;
  }

  small {
    overflow-wrap: anywhere;
    color: var(--app-text-muted);
    font-size: 11px;
  }
}

.task-progress {
  display: grid;
  gap: 6px;
  padding: 10px;
  margin: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--app-text-muted);
    font-size: 13px;
  }

  .running {
    color: var(--app-primary);
  }

  .done {
    color: var(--app-success-text);
  }

  .error {
    color: var(--app-danger-text);
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
  background: var(--app-danger-soft);
  color: var(--app-danger-text);
}

.task-result {
  background: var(--app-bg-soft);
  color: var(--app-text-secondary);

  p {
    white-space: pre-wrap;
    max-height: 180px;
    overflow: auto;
    margin: 8px 0;
  }
}
</style>
