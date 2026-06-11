<template>
  <section class="save-pipeline-panel" aria-label="保存流水线">
    <header>
      <div>
        <div class="panel-title">保存流水线</div>
        <p>{{ summaryText }}</p>
      </div>
      <div class="panel-actions">
        <el-switch :model-value="autoRun" size="small" @update:model-value="$emit('update:auto-run', Boolean($event))" />
        <el-tooltip content="立即运行" placement="top">
          <el-button circle size="small" :icon="RefreshRight" :loading="isRunning" @click="$emit('run')" />
        </el-tooltip>
      </div>
    </header>

    <ol class="step-list">
      <li v-for="step in visibleSteps" :key="step.id" class="step-item" :class="step.status">
        <span class="step-dot" aria-hidden="true" />
        <div class="step-copy">
          <strong>{{ step.label }}</strong>
          <small>{{ step.detail || statusLabel(step.status) }}</small>
        </div>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RefreshRight } from "@element-plus/icons-vue";
import type { SavePipelineStep, SavePipelineStepStatus } from "@/types/novel";

const props = defineProps<{
  autoRun: boolean;
  steps: SavePipelineStep[];
  isRunning?: boolean;
}>();

defineEmits<{
  "update:auto-run": [value: boolean];
  run: [];
}>();

const defaultSteps: SavePipelineStep[] = [
  { id: "save", label: "保存", status: "pending" },
  { id: "recap", label: "回顾", status: "pending" },
  { id: "runtime", label: "快照", status: "pending" },
  { id: "quality", label: "质量", status: "pending" },
  { id: "knowledge", label: "索引", status: "pending" },
  { id: "story", label: "故事图谱", status: "pending" }
];

const statusLabels: Record<SavePipelineStepStatus, string> = {
  pending: "待运行",
  running: "运行中",
  queued: "后台处理中",
  done: "完成",
  skipped: "跳过",
  error: "失败"
};

const visibleSteps = computed(() => (props.steps.length ? props.steps : defaultSteps));

const summaryText = computed(() => {
  if (props.isRunning) return "正在运行 recap / runtime，后台稍后重建质量与索引";
  if (props.autoRun) return "章节正文保存后自动运行关键路径";
  return "手动运行，或开启自动保存后编排";
});

function statusLabel(status: SavePipelineStepStatus) {
  return statusLabels[status] || status;
}
</script>

<style scoped lang="scss">
.save-pipeline-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
  color: var(--app-text-primary);
}

header,
.panel-actions,
.step-item {
  display: flex;
  align-items: center;
}

header {
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  color: var(--app-text-primary);
  font-size: 14px;
  font-weight: 800;
}

p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}

.panel-actions {
  flex: 0 0 auto;
  gap: 8px;
}

.step-list {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-item {
  min-width: 0;
  gap: 6px;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);

  &.running {
    border-color: var(--app-warning-text);
    background: var(--app-warning-soft);
  }

  &.queued {
    border-color: var(--app-primary);
    background: var(--app-primary-soft);
  }

  &.done {
    border-color: var(--app-success-text);
    background: var(--app-success-soft);
  }

  &.skipped {
    border-color: var(--app-text-muted);
  }

  &.error {
    border-color: var(--app-danger-text);
    background: var(--app-danger-soft);
  }
}

.step-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--app-text-muted);
}

.running .step-dot {
  background: var(--app-warning-text);
}

.queued .step-dot {
  background: var(--app-primary);
}

.done .step-dot {
  background: var(--app-success-text);
}

.error .step-dot {
  background: var(--app-danger-text);
}

.step-copy {
  display: grid;
  min-width: 0;
  gap: 2px;

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--app-text-primary);
    font-size: 12px;
  }

  small {
    color: var(--app-text-muted);
    font-size: 11px;
  }
}

@media (max-width: 760px) {
  header {
    align-items: flex-start;
    flex-direction: column;
  }

  .step-list {
    grid-template-columns: 1fr;
  }
}
</style>
