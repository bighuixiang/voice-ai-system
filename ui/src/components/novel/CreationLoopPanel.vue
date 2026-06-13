<template>
  <section class="creation-loop-panel" aria-label="章节创作闭环">
    <div class="runtime-console">
      <div class="runtime-title">
        <p class="eyebrow">Chapter Runtime</p>
        <h2>{{ runtimeSnapshot?.chapterTitle || "章节运行时总览" }}</h2>
        <div class="loop-meta">
          <span v-if="runtimeSnapshot?.activeStepId" class="runtime-chip">
            {{ runtimeSnapshot.activeStepId }} · {{ runtimeSnapshot.signals.wordCount }} 字 · #{{ runtimeFingerprint }}
          </span>
          <span class="loop-summary">{{ doneCount }} / {{ steps.length }} 已沉淀</span>
        </div>
      </div>

      <div v-if="primaryAction" class="next-action-card" :class="`is-${primaryAction.priority}`">
        <span class="next-action-label">{{ priorityLabel(primaryAction.priority) }}</span>
        <strong>{{ primaryAction.label }}</strong>
        <p>{{ primaryAction.reason }}</p>
        <el-button :disabled="loading" type="primary" size="small" @click="$emit('action', primaryAction.action)">
          <el-icon><ArrowRight /></el-icon>
          执行
        </el-button>
      </div>
    </div>

    <div v-if="secondaryActions.length" class="secondary-actions" aria-label="次级下一步动作">
      <button
        v-for="action in secondaryActions"
        :key="action.id"
        type="button"
        :disabled="loading"
        @click="$emit('action', action.action)"
      >
        <strong>{{ action.label }}</strong>
        <span>{{ action.reason }}</span>
      </button>
    </div>

    <div v-if="visibleRiskSignals.length" class="risk-radar" aria-label="本章风险雷达">
      <article v-for="signal in visibleRiskSignals" :key="signal.id" :class="`is-${signal.status}`">
        <span>{{ signal.label }}</span>
        <p>{{ signal.reason }}</p>
        <button v-if="signal.action && signal.actionLabel" type="button" :disabled="loading" @click="$emit('action', signal.action)">
          {{ signal.actionLabel }}
        </button>
      </article>
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
        <div v-if="step.signals?.length" class="step-signals" aria-label="创作状态信号">
          <span v-for="signal in step.signals.slice(0, 3)" :key="signal">{{ signal }}</span>
        </div>

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
import type { CreationLoopAction, CreationLoopStep, CreationRuntimeSnapshot, WorkbenchNextAction, WorkbenchRiskSignal } from "@/types/novel";

const props = withDefaults(
  defineProps<{
    steps: CreationLoopStep[];
    nextActions?: WorkbenchNextAction[];
    riskSignals?: WorkbenchRiskSignal[];
    loading?: boolean;
    runtimeSnapshot?: CreationRuntimeSnapshot | null;
  }>(),
  {
    nextActions: () => [],
    riskSignals: () => [],
    loading: false,
    runtimeSnapshot: null
  }
);

defineEmits<{
  action: [action: CreationLoopAction];
}>();

const doneCount = computed(() => props.steps.filter((step) => step.status === "done").length);
const runtimeFingerprint = computed(() => props.runtimeSnapshot?.fingerprint.slice(0, 8) || "");
const primaryAction = computed(() => props.nextActions[0]);
const secondaryActions = computed(() => props.nextActions.slice(1, 3));
const radarSignals = computed(() => {
  const signals = new Set<string>();
  const blockedCount = props.steps.filter((step) => step.status === "blocked").length;
  const activeCount = props.steps.filter((step) => step.status === "active").length;
  if (blockedCount) signals.add(`阻塞 ${blockedCount}`);
  if (activeCount) signals.add(`进行中 ${activeCount}`);
  for (const step of props.steps) {
    for (const signal of step.signals || []) {
      signals.add(signal);
    }
  }
  return [...signals].slice(0, 8);
});
const visibleRiskSignals = computed<WorkbenchRiskSignal[]>(() => {
  if (props.riskSignals.length) return props.riskSignals.slice(0, 6);
  return radarSignals.value.map((signal, index) => ({
    id: `loop-${index}`,
    label: signal,
    status: signal.includes("阻塞") ? "blocked" : "watch",
    reason: "来自闭环步骤的聚合信号。",
    source: "loop"
  }));
});

function priorityLabel(priority: WorkbenchNextAction["priority"]) {
  if (priority === "critical") return "必须先做";
  if (priority === "recommended") return "建议下一步";
  return "可继续";
}
</script>

<style scoped lang="scss">
.creation-loop-panel {
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--app-primary) 10%, transparent), transparent 38%),
    var(--app-bg);
  color: var(--app-text-primary);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
}

.runtime-console {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.runtime-title {
  display: grid;
  gap: 8px;

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 20px;
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
  justify-content: flex-start;
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

.next-action-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);

  strong,
  p {
    margin: 0;
    min-width: 0;
  }

  strong {
    color: var(--app-text-primary);
    font-size: 15px;
  }

  p {
    grid-column: 1 / -1;
    color: var(--app-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  :deep(.el-button) {
    grid-row: 1 / span 2;
    grid-column: 2;
    align-self: center;
  }

  &.is-critical {
    border-color: color-mix(in srgb, var(--app-danger-text) 48%, var(--app-border));
    background: var(--app-danger-soft);
  }

  &.is-recommended {
    border-color: color-mix(in srgb, var(--app-primary) 45%, var(--app-border));
    background: var(--app-primary-soft);
  }
}

.next-action-label {
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.secondary-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;

  button {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--app-border);
    border-radius: 7px;
    background: var(--app-bg);
    color: var(--app-text-primary);
    text-align: left;
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 12px;
  }

  span {
    color: var(--app-text-muted);
    font-size: 11px;
  }
}

.risk-radar {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;

  article {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 5px;
    min-height: 86px;
    padding: 8px;
    border: 1px solid var(--app-border);
    border-radius: 7px;
    background: var(--app-bg);

    &.is-blocked {
      border-color: color-mix(in srgb, var(--app-danger-text) 48%, var(--app-border));
      background: var(--app-danger-soft);
    }

    &.is-watch {
      border-color: color-mix(in srgb, var(--app-warning-text) 45%, var(--app-border));
      background: var(--app-warning-soft);
    }

    &.is-stable {
      border-color: color-mix(in srgb, var(--app-success-text) 34%, var(--app-border));
    }
  }

  span {
    overflow: hidden;
    color: var(--app-text-primary);
    font-size: 12px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--app-text-secondary);
    font-size: 11px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  button {
    justify-self: start;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--app-primary-text);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
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

.step-signals {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  span {
    min-width: 0;
    overflow: hidden;
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--app-primary) 28%, var(--app-border));
    border-radius: 999px;
    background: var(--app-bg);
    color: var(--app-text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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
  .risk-radar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .loop-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .runtime-console,
  .secondary-actions,
  .risk-radar {
    grid-template-columns: 1fr;
  }

  .loop-meta {
    justify-content: flex-start;
  }

  .loop-steps {
    grid-template-columns: 1fr;
  }
}
</style>
