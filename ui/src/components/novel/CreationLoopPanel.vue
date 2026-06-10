<template>
  <section class="creation-loop-panel" aria-label="章节创作闭环">
    <div class="loop-header">
      <div>
        <p class="eyebrow">Chapter Loop</p>
        <h2>创作闭环</h2>
      </div>
      <div class="loop-meta">
        <span v-if="runtimeSnapshot?.activeStepId" class="runtime-chip">
          {{ runtimeSnapshot.activeStepId }} · {{ runtimeSnapshot.signals.wordCount }} 字 · #{{ runtimeFingerprint }}
        </span>
        <span class="loop-summary">{{ doneCount }} / {{ steps.length }} 已沉淀</span>
      </div>
    </div>

    <ol class="loop-steps">
      <li v-for="step in steps" :key="step.id" class="loop-step" :class="`is-${step.status}`">
        <div class="step-topline">
          <span class="status-icon" aria-hidden="true">
            <el-icon v-if="step.status === 'done'"><CircleCheck /></el-icon>
            <el-icon v-else-if="step.status === 'active'" class="is-spinning"><Loading /></el-icon>
            <el-icon v-else-if="step.status === 'blocked'"><Warning /></el-icon>
            <span v-else class="status-dot" />
          </span>
          <strong>{{ step.label }}</strong>
          <span v-if="step.metric" class="step-metric">{{ step.metric }}</span>
        </div>

        <p>{{ step.detail }}</p>

        <el-button
          v-if="step.action && step.actionLabel"
          size="small"
          text
          :disabled="loading || step.status === 'blocked'"
          @click="$emit('action', step.action)"
        >
          <el-icon><ArrowRight /></el-icon>
          {{ step.actionLabel }}
        </el-button>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight, CircleCheck, Loading, Warning } from "@element-plus/icons-vue";
import type { CreationLoopAction, CreationLoopStep, CreationRuntimeSnapshot } from "@/types/novel";

const props = withDefaults(
  defineProps<{
    steps: CreationLoopStep[];
    loading?: boolean;
    runtimeSnapshot?: CreationRuntimeSnapshot | null;
  }>(),
  {
    loading: false,
    runtimeSnapshot: null
  }
);

defineEmits<{
  action: [action: CreationLoopAction];
}>();

const doneCount = computed(() => props.steps.filter((step) => step.status === "done").length);
const runtimeFingerprint = computed(() => props.runtimeSnapshot?.fingerprint.slice(0, 8) || "");
</script>

<style scoped lang="scss">
.creation-loop-panel {
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--app-primary) 10%, transparent), transparent 38%),
    var(--app-bg);
  color: var(--app-text-primary);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
}

.loop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 15px;
    letter-spacing: 0;
  }
}

.eyebrow {
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.loop-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.loop-summary,
.runtime-chip {
  flex: 0 0 auto;
  padding: 3px 8px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-bg-soft);
  color: var(--app-text-muted);
  font-size: 12px;
}

.runtime-chip {
  border-color: color-mix(in srgb, var(--app-primary) 38%, var(--app-border));
  background: var(--app-primary-soft);
  color: var(--app-primary-text);
}

.loop-steps {
  display: grid;
  grid-template-columns: repeat(6, minmax(118px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.loop-step {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 8px;
  min-height: 118px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);
  transition:
    border-color 180ms ease,
    transform 180ms ease,
    background 180ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--app-primary) 45%, var(--app-border));
  }

  p {
    margin: 0;
    color: var(--app-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  :deep(.el-button) {
    justify-self: start;
    min-height: 24px;
    padding: 0;
    color: var(--app-primary-text);
    font-weight: 700;
  }

  &.is-done {
    border-color: color-mix(in srgb, var(--app-success-text) 48%, var(--app-border));
    background: linear-gradient(180deg, var(--app-success-soft), var(--app-bg-soft));
  }

  &.is-active {
    border-color: var(--app-primary);
    background: linear-gradient(180deg, var(--app-primary-soft), var(--app-bg-soft));
  }

  &.is-blocked {
    opacity: 0.72;
  }
}

.step-topline {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;

  strong {
    overflow: hidden;
    color: var(--app-text-primary);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.status-icon {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  color: var(--app-primary);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--app-text-muted);
}

.step-metric {
  color: var(--app-text-muted);
  font-size: 11px;
}

.is-spinning {
  animation: loop-spin 1s linear infinite;
}

@keyframes loop-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1320px) {
  .loop-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .loop-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .loop-meta {
    justify-content: flex-start;
  }

  .loop-steps {
    grid-template-columns: 1fr;
  }
}
</style>
