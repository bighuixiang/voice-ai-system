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
  { id: "quality", label: "质量", status: "pending" },
  { id: "knowledge", label: "索引", status: "pending" },
  { id: "runtime", label: "快照", status: "pending" }
];

const statusLabels: Record<SavePipelineStepStatus, string> = {
  pending: "待运行",
  running: "运行中",
  done: "完成",
  skipped: "跳过",
  error: "失败"
};

const visibleSteps = computed(() => (props.steps.length ? props.steps : defaultSteps));

const summaryText = computed(() => {
  if (props.isRunning) return "正在编排 recap / quality / index";
  if (props.autoRun) return "章节正文保存后自动运行";
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
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
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
  color: #111827;
  font-size: 14px;
  font-weight: 800;
}

p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 12px;
}

.panel-actions {
  flex: 0 0 auto;
  gap: 8px;
}

.step-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-item {
  min-width: 0;
  gap: 6px;
  padding: 7px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #f8fafc;

  &.running {
    border-color: #f59e0b;
    background: #fffbeb;
  }

  &.done {
    border-color: #16a34a;
    background: #f0fdf4;
  }

  &.skipped {
    border-color: #94a3b8;
  }

  &.error {
    border-color: #dc2626;
    background: #fef2f2;
  }
}

.step-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #94a3b8;
}

.running .step-dot {
  background: #f59e0b;
}

.done .step-dot {
  background: #16a34a;
}

.error .step-dot {
  background: #dc2626;
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
    color: #0f172a;
    font-size: 12px;
  }

  small {
    color: #64748b;
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
