<template>
  <section class="creation-loop-panel" aria-label="章节创作闭环">
    <div class="runtime-console">
      <div class="runtime-title">
        <p class="eyebrow">章节运行时</p>
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
      <article
        v-for="signal in visibleRiskSignals"
        :key="signal.id"
        :class="`is-${signal.status}`"
        role="button"
        tabindex="0"
        @click="openRisk(signal)"
        @keyup.enter="openRisk(signal)"
      >
        <span>{{ signal.label }}</span>
        <p>{{ signal.reason }}</p>
        <small>{{ (signal.detailRows?.length || 0) + (signal.sourceRefs?.length || 0) }} 条来源</small>
        <button
          v-if="hasRiskShortcut(signal)"
          type="button"
          :disabled="loading"
          @click.stop="runRiskShortcut(signal)"
        >
          {{ signal.commandLabel || signal.actionLabel || "定位" }}
        </button>
      </article>
    </div>

    <el-drawer v-model="riskDrawerOpen" size="380px" :with-header="false" append-to-body>
      <section v-if="selectedRisk" class="risk-drawer" aria-label="风险来源详情">
        <div class="drawer-heading">
          <span :class="`risk-status is-${selectedRisk.status}`">{{ riskStatusLabel(selectedRisk.status) }}</span>
          <h3>{{ selectedRisk.label }}</h3>
          <p>{{ selectedRisk.reason }}</p>
        </div>

        <div class="source-section">
          <div class="source-title">来源明细</div>
          <dl>
            <template v-for="row in selectedRisk.detailRows || []" :key="row.id">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value || "未记录" }}</dd>
            </template>
          </dl>
          <p v-if="!selectedRisk.detailRows?.length" class="empty-source">暂无结构化来源。</p>
        </div>

        <div class="source-section">
          <div class="source-title">证据引用</div>
          <div v-for="ref in selectedRisk.sourceRefs || []" :key="ref.id" class="source-ref">
            <span>{{ ref.label }}</span>
            <strong>{{ ref.value || ref.id }}</strong>
          </div>
          <p v-if="!selectedRisk.sourceRefs?.length" class="empty-source">暂无额外证据。</p>
        </div>

        <div class="drawer-actions">
          <el-button v-if="selectedRisk.command" type="primary" :disabled="loading" @click="runRiskCommand(selectedRisk.command)">
            {{ selectedRisk.commandLabel || "定位" }}
          </el-button>
          <el-button v-if="selectedRisk.action" :disabled="loading" @click="runRiskAction(selectedRisk.action)">
            {{ selectedRisk.actionLabel || "执行" }}
          </el-button>
        </div>
      </section>
    </el-drawer>

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
import { computed, ref } from "vue";
import { ArrowRight, CircleCheck, Loading, Warning } from "@element-plus/icons-vue";
import type {
  CreationLoopAction,
  CreationLoopStep,
  CreationRuntimeSnapshot,
  WorkbenchCommand,
  WorkbenchNextAction,
  WorkbenchRiskSignal
} from "@/types/novel";

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

const emit = defineEmits<{
  action: [action: CreationLoopAction];
  command: [command: WorkbenchCommand];
}>();

const doneCount = computed(() => props.steps.filter((step) => step.status === "done").length);
const runtimeFingerprint = computed(() => props.runtimeSnapshot?.fingerprint.slice(0, 8) || "");
const primaryAction = computed(() => props.nextActions[0]);
const secondaryActions = computed(() => props.nextActions.slice(1, 3));
const selectedRiskId = ref<string | null>(null);
const riskDrawerOpen = ref(false);
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
const selectedRisk = computed(() => visibleRiskSignals.value.find((signal) => signal.id === selectedRiskId.value) || null);

function priorityLabel(priority: WorkbenchNextAction["priority"]) {
  if (priority === "critical") return "必须先做";
  if (priority === "recommended") return "建议下一步";
  return "可继续";
}

function riskStatusLabel(status: WorkbenchRiskSignal["status"]) {
  if (status === "blocked") return "阻塞";
  if (status === "watch") return "观察";
  return "稳定";
}

function openRisk(signal: WorkbenchRiskSignal) {
  selectedRiskId.value = signal.id;
  riskDrawerOpen.value = true;
}

function runRiskAction(action: CreationLoopAction) {
  emit("action", action);
}

function runRiskCommand(command: WorkbenchCommand) {
  emit("command", command);
}

function hasRiskShortcut(signal: WorkbenchRiskSignal) {
  return Boolean(signal.command || signal.action);
}

function runRiskShortcut(signal: WorkbenchRiskSignal) {
  if (signal.command) {
    runRiskCommand(signal.command);
    return;
  }
  if (signal.action) runRiskAction(signal.action);
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
    grid-template-rows: auto 1fr auto auto;
    gap: 5px;
    min-height: 86px;
    padding: 8px;
    border: 1px solid var(--app-border);
    border-radius: 7px;
    background: var(--app-bg);
    cursor: pointer;
    outline: none;

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

    &:focus-visible {
      border-color: var(--app-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-primary) 24%, transparent);
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

  small {
    color: var(--app-text-muted);
    font-size: 10px;
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

.risk-drawer {
  display: grid;
  gap: 14px;
  color: var(--app-text-primary);
}

.drawer-heading {
  display: grid;
  gap: 8px;

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 18px;
    letter-spacing: 0;
  }

  p {
    color: var(--app-text-secondary);
    font-size: 13px;
    line-height: 1.6;
  }
}

.risk-status {
  justify-self: start;
  padding: 3px 8px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-bg-soft);
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 800;

  &.is-blocked {
    border-color: color-mix(in srgb, var(--app-danger-text) 45%, var(--app-border));
    background: var(--app-danger-soft);
    color: var(--app-danger-text);
  }

  &.is-watch {
    border-color: color-mix(in srgb, var(--app-warning-text) 45%, var(--app-border));
    background: var(--app-warning-soft);
    color: var(--app-warning-text);
  }

  &.is-stable {
    border-color: color-mix(in srgb, var(--app-success-text) 38%, var(--app-border));
    background: var(--app-success-soft);
    color: var(--app-success-text);
  }
}

.source-section {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);

  dl {
    display: grid;
    grid-template-columns: minmax(92px, auto) minmax(0, 1fr);
    gap: 6px 10px;
    margin: 0;
  }

  dt {
    color: var(--app-text-muted);
    font-size: 12px;
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--app-text-primary);
    font-size: 12px;
    font-weight: 700;
  }
}

.source-title {
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 800;
}

.source-ref {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);

  span {
    color: var(--app-text-muted);
    font-size: 11px;
  }

  strong {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--app-text-primary);
    font-size: 12px;
  }
}

.empty-source {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
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
