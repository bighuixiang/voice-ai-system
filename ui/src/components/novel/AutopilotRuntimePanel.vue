<template>
  <div class="autopilot-runtime-panel" :class="{ 'is-runtime-active': isRuntimeActive }">
    <div class="runtime-status-row">
      <div>
        <strong>{{ statusLabel }}</strong>
        <span>{{ stageLabel }}</span>
      </div>
      <el-tag size="small" :type="eventConnected ? 'success' : 'info'">
        {{ eventConnected ? "SSE connected" : "SSE offline" }}
      </el-tag>
    </div>

    <div v-if="activeRun" class="runtime-progress-card">
      <div class="runtime-progress-head">
        <span>{{ runtimeProgressText }}</span>
        <b>{{ runtimeProgressPercent }}%</b>
      </div>
      <div class="runtime-progress-track" aria-hidden="true">
        <span :style="{ width: `${runtimeProgressPercent}%` }" />
      </div>
      <ol class="runtime-stage-list" aria-label="自动驾驶阶段">
        <li v-for="stage in runtimeStageItems" :key="stage.id" :class="stage.status">
          <span />
          <small>{{ stage.label }}</small>
        </li>
      </ol>
    </div>

    <div class="runtime-controls">
      <el-button type="primary" :loading="starting" :disabled="isRunning" @click="emitStart()">
        <el-icon><VideoPlay /></el-icon>
        启动自动驾驶
      </el-button>
      <el-switch v-model="autoContinue" active-text="连续章节" />
      <el-button :disabled="!canPause" @click="$emit('pause')">
        <el-icon><VideoPause /></el-icon>
        暂停
      </el-button>
      <el-button :disabled="!canResume" @click="$emit('resume')">
        <el-icon><RefreshRight /></el-icon>
        恢复
      </el-button>
      <el-button :disabled="!activeRun" @click="$emit('stop')">
        <el-icon><CircleClose /></el-icon>
        停止
      </el-button>
      <el-button @click="$emit('refresh')">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <el-input
      v-model="direction"
      type="textarea"
      :rows="2"
      placeholder="给自动驾驶补充本章方向、审稿意见或改写要求"
    />
    <div class="direction-actions">
      <el-button :disabled="!canSendDirection" @click="handleDirectionAction()">
        发送方向
      </el-button>
      <el-button type="warning" :disabled="!canRequestRewrite" @click="handleRewriteAction()">
        要求重写
      </el-button>
      <el-button type="success" :disabled="activeRun?.status !== 'review_required'" @click="$emit('accept')">
        接受审稿
      </el-button>
    </div>

    <section class="snapshot-card">
      <header>
        <strong>运行依据</strong>
        <span>{{ snapshotTitle }}</span>
      </header>
      <div class="snapshot-metrics">
        <span>{{ contextBlocks.length }} 个上下文块</span>
        <span>{{ budgetText }}</span>
        <span>{{ knowledgeSignalText }}</span>
        <span>{{ explanationRefs.length }} 条引用</span>
      </div>
      <div v-if="truncatedBudgetBlocks.length" class="context-strip">
        <span v-for="block in truncatedBudgetBlocks.slice(0, 4)" :key="block.title" :title="block.reason">
          截断: {{ block.title }}
        </span>
      </div>
      <div v-if="contextBlocks.length" class="context-strip">
        <span v-for="block in contextBlocks.slice(0, 4)" :key="block.title" :title="block.preview">
          {{ block.title }}
        </span>
      </div>
      <ol v-if="explanationRefs.length" class="knowledge-ref-list">
        <li v-for="ref in explanationRefs.slice(0, 8)" :key="ref.id">
          <span>{{ kindLabel(ref.kind) }}</span>
          <p>{{ ref.label }}</p>
          <small v-if="scoreLabel(ref.score)">{{ scoreLabel(ref.score) }}</small>
        </li>
      </ol>
      <p v-else class="empty-note">暂无上下文索引，启动自动驾驶后会自动记录。</p>
    </section>

    <div class="runtime-grid">
      <section>
        <header>
          <strong>事件流</strong>
          <span>{{ events.length }} 条</span>
        </header>
        <ol class="event-list">
          <li v-for="event in events.slice(-24).reverse()" :key="event.id">
            <span>{{ event.stage || event.type }}</span>
            <p>{{ event.message }}</p>
          </li>
        </ol>
      </section>

      <section>
        <header>
          <strong>检查点</strong>
          <span>{{ checkpoints.length }} 个</span>
        </header>
        <div class="checkpoint-list">
          <button
            v-for="checkpoint in checkpoints.slice(0, 8)"
            :key="checkpoint.id"
            type="button"
            @click="$emit('restore', checkpoint.id)"
          >
            <span>{{ checkpoint.label }}</span>
            <small>{{ checkpoint.chapterId || checkpoint.id }}</small>
          </button>
        </div>
      </section>
    </div>

    <div class="derivative-row">
      <el-input v-model="derivativeTitle" placeholder="衍生剧情标题" />
      <el-select v-model="derivativeType" style="width: 132px">
        <el-option label="番外" value="side_story" />
        <el-option label="支线" value="branch" />
        <el-option label="改编" value="adaptation" />
      </el-select>
      <el-button :disabled="!derivativeTitle.trim()" @click="$emit('derivative', { title: derivativeTitle, type: derivativeType, direction })">
        创建衍生
      </el-button>
    </div>

    <div v-if="branches.length" class="branch-strip">
      <button
        v-for="branch in branches.slice(0, 6)"
        :key="branch.id"
        type="button"
        :disabled="branch.status === 'merged'"
        @click="$emit('mergeDerivative', branch.id)"
      >
        <span>{{ branch.title }}</span>
        <small>{{ branch.status }}</small>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CircleClose, Refresh, RefreshRight, VideoPause, VideoPlay } from "@element-plus/icons-vue";
import type {
  RuntimeCheckpoint,
  RuntimeDerivativeBranch,
  RuntimeEvent,
  RuntimeKnowledgeRef,
  RuntimeRun,
  RuntimeSnapshotRecord
} from "@/types/novel";

defineOptions({
  name: "AutopilotRuntimePanel"
});

const props = withDefaults(defineProps<{
  activeRun?: RuntimeRun;
  events: RuntimeEvent[];
  checkpoints: RuntimeCheckpoint[];
  branches: RuntimeDerivativeBranch[];
  latestSnapshot?: RuntimeSnapshotRecord;
  knowledgeRefs: RuntimeKnowledgeRef[];
  eventConnected: boolean;
  starting: boolean;
}>(), {
  events: () => [],
  checkpoints: () => [],
  branches: () => [],
  knowledgeRefs: () => [],
  eventConnected: false,
  starting: false
});

const emit = defineEmits<{
  start: [input: { direction: string; autoContinue: boolean }];
  pause: [];
  resume: [];
  stop: [];
  accept: [];
  rewrite: [direction: string];
  direction: [direction: string];
  derivative: [input: { title: string; type: "side_story" | "branch" | "adaptation"; direction?: string }];
  mergeDerivative: [branchId: string];
  restore: [checkpointId: string];
  refresh: [];
}>();

const direction = ref("");
const autoContinue = ref(false);
const derivativeTitle = ref("");
const derivativeType = ref<"side_story" | "branch" | "adaptation">("side_story");
const runtimeStages: Array<{ id: NonNullable<RuntimeRun["currentStage"]>; label: string }> = [
  { id: "find_next_chapter", label: "找章节" },
  { id: "checkpoint_before_run", label: "快照" },
  { id: "prepare_narrative_snapshot", label: "叙事快照" },
  { id: "chapter_plan", label: "规划" },
  { id: "context_assemble", label: "上下文" },
  { id: "chapter_draft", label: "起草" },
  { id: "content_validate", label: "校验" },
  { id: "quality_review", label: "质检" },
  { id: "recap_and_ledger", label: "复盘" },
  { id: "knowledge_index_update", label: "索引" },
  { id: "story_graph_update", label: "故事图" },
  { id: "finalize_or_gate", label: "收尾" }
];

const trimmedDirection = computed(() => direction.value.trim());
const hasActiveRun = computed(() => Boolean(props.activeRun));
const isRunning = computed(() => props.activeRun?.status === "queued" || props.activeRun?.status === "running");
const isRuntimeActive = computed(() => props.activeRun?.status === "queued" || props.activeRun?.status === "running");
const canPause = computed(() => props.activeRun?.status === "running" || props.activeRun?.status === "queued");
const canResume = computed(() => props.activeRun?.status === "paused");
const canStartFromDirection = computed(() => Boolean(trimmedDirection.value) && !props.starting && !isRunning.value);
const canSendDirection = computed(() => (hasActiveRun.value ? Boolean(trimmedDirection.value) : canStartFromDirection.value));
const canRequestRewrite = computed(() => (hasActiveRun.value ? true : canStartFromDirection.value));
const currentStageIndex = computed(() => {
  const stage = props.activeRun?.currentStage;
  if (!stage) return props.activeRun?.status === "completed" ? runtimeStages.length - 1 : -1;
  return runtimeStages.findIndex((item) => item.id === stage);
});
const runtimeProgressPercent = computed(() => {
  if (!props.activeRun) return 0;
  if (props.activeRun.status === "completed") return 100;
  if (props.activeRun.status === "failed" || props.activeRun.status === "cancelled") return Math.max(0, Math.round(((currentStageIndex.value + 1) / runtimeStages.length) * 100));
  return Math.max(8, Math.round(((currentStageIndex.value + 1) / runtimeStages.length) * 100));
});
const runtimeProgressText = computed(() => {
  if (!props.activeRun) return "未启动";
  if (props.activeRun.status === "review_required") return "等待人工审稿确认";
  if (props.activeRun.status === "completed") return "自动驾驶已完成";
  if (props.activeRun.status === "failed") return "自动驾驶失败";
  if (props.activeRun.status === "cancelled") return "自动驾驶已停止";
  const stage = runtimeStages[currentStageIndex.value];
  return stage ? `当前阶段：${stage.label}` : "正在进入队列";
});
const runtimeStageItems = computed(() =>
  runtimeStages.map((stage, index) => ({
    ...stage,
    status:
      props.activeRun?.status === "completed" || index < currentStageIndex.value
        ? "done"
        : index === currentStageIndex.value
          ? props.activeRun?.status === "failed"
            ? "error"
            : "running"
          : "waiting"
  }))
);
const contextBlocks = computed(() => props.latestSnapshot?.snapshot.contextBlocks || []);
const explanationRefs = computed(() => props.knowledgeRefs.filter((ref) => ref.kind !== "context_block").slice(0, 16));
const snapshotTitle = computed(() => {
  const snapshot = props.latestSnapshot?.snapshot;
  if (!snapshot) return "等待生成";
  return `${snapshot.chapterTitle || snapshot.chapterId} · ${snapshot.createdAt.slice(0, 16).replace("T", " ")}`;
});
const knowledgeSignalText = computed(() => {
  const signals = props.latestSnapshot?.snapshot.knowledgeSignals;
  if (!signals) return "0 facts / 0 triples";
  return `${signals.factCount} facts / ${signals.tripleCount} triples`;
});
const truncatedBudgetBlocks = computed(() => props.latestSnapshot?.snapshot.contextBudget?.truncatedBlocks || []);
const budgetText = computed(() => {
  const budget = props.latestSnapshot?.snapshot.contextBudget;
  if (!budget) return "0 chars";
  return `${budget.totalFinalChars}/${budget.totalOriginalChars} chars`;
});
const statusLabel = computed(() => {
  const status = props.activeRun?.status;
  if (!status) return "未启动";
  const labels: Record<RuntimeRun["status"], string> = {
    queued: "排队中",
    running: "运行中",
    paused: "已暂停",
    review_required: "等待审稿",
    completed: "已完成",
    failed: "失败",
    cancelled: "已停止"
  };
  return labels[status];
});
const stageLabel = computed(() => props.activeRun?.currentStage || props.activeRun?.chapterId || "等待指令");
function kindLabel(kind: RuntimeKnowledgeRef["kind"]) {
  const labels: Record<RuntimeKnowledgeRef["kind"], string> = {
    context_block: "上下文",
    fact: "事实",
    triple: "三元组",
    chapter: "章节",
    summary: "摘要",
    ledger: "账本",
    quality: "质量"
  };
  return labels[kind] || kind;
}

function scoreLabel(score?: number) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "";
  if (score > 1) return String(Math.round(score));
  return score.toFixed(2);
}

function emitStart() {
  if (props.starting || isRunning.value) return;
  emit("start", { direction: trimmedDirection.value, autoContinue: autoContinue.value });
}

function handleDirectionAction() {
  if (hasActiveRun.value) {
    if (!trimmedDirection.value) return;
    emit("direction", trimmedDirection.value);
    return;
  }
  if (!canStartFromDirection.value) return;
  emitStart();
}

function handleRewriteAction() {
  if (hasActiveRun.value) {
    emit("rewrite", trimmedDirection.value);
    return;
  }
  if (!canStartFromDirection.value) return;
  emitStart();
}
</script>

<style scoped lang="scss">
.autopilot-runtime-panel {
  position: relative;
  display: grid;
  gap: 10px;
}

.runtime-status-row,
.runtime-controls,
.direction-actions,
.derivative-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.runtime-status-row {
  justify-content: space-between;

  div {
    display: grid;
    gap: 2px;
  }

  span {
    color: var(--app-text-secondary);
    font-size: 12px;
  }
}

.runtime-progress-card {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
  overflow: hidden;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;

  &::before,
  &::after {
    position: absolute;
    inset: -55%;
    z-index: 0;
    content: "";
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms ease;
  }

  &::before {
    background:
      conic-gradient(
        from 0deg,
        transparent 0deg,
        rgba(69, 199, 255, 0.2) 54deg,
        rgba(126, 255, 184, 0.18) 112deg,
        transparent 178deg,
        rgba(116, 144, 255, 0.16) 246deg,
        transparent 360deg
      );
    filter: blur(18px);
  }

  &::after {
    inset: 1px;
    border-radius: 6px;
    background:
      radial-gradient(circle at 18% 20%, rgba(69, 199, 255, 0.12), transparent 28%),
      radial-gradient(circle at 86% 64%, rgba(126, 255, 184, 0.1), transparent 34%),
      var(--app-bg-soft);
  }

  > * {
    position: relative;
    z-index: 1;
  }
}

.is-runtime-active .runtime-progress-card {
  border-color: color-mix(in srgb, var(--app-primary) 58%, var(--app-border));
  box-shadow:
    0 0 0 1px rgba(69, 199, 255, 0.06),
    0 0 24px rgba(69, 199, 255, 0.12),
    0 0 42px rgba(126, 255, 184, 0.08);

  &::before {
    opacity: 1;
    animation: runtimeAuraFlow 4.8s linear infinite;
  }

  &::after {
    opacity: 1;
  }
}

.runtime-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--app-text-secondary);
  font-size: 12px;

  b {
    color: var(--app-primary);
    font-size: 16px;
  }
}

.runtime-progress-track {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--app-bg-muted);

  span {
    position: relative;
    display: block;
    height: 100%;
    border-radius: inherit;
    background:
      linear-gradient(90deg, var(--app-primary), var(--app-success)),
      linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.58), transparent);
    background-size: 100% 100%, 42px 100%;
    background-position: 0 0, -42px 0;
    box-shadow: 0 0 16px color-mix(in srgb, var(--app-primary) 45%, transparent);
    transition: width 260ms ease;
  }
}

.is-runtime-active .runtime-progress-track span {
  animation: runtimeProgressShimmer 1.35s ease-in-out infinite;
}

.runtime-stage-list {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 5px;
    align-items: center;
    min-width: 0;
    color: var(--app-text-muted);
  }

  li > span {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: currentColor;
  }

  li.running {
    color: var(--app-primary);

    > span {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--app-primary) 38%, transparent);
      animation: runtimeStagePulse 1.45s ease-out infinite;
    }
  }

  li.done {
    color: var(--app-success-text);
  }

  li.error {
    color: var(--app-danger-text);
  }

  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }
}

.runtime-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.7fr);
  gap: 10px;
}

section {
  min-width: 0;

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    color: var(--app-text-secondary);
    font-size: 12px;
  }
}

.snapshot-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg-soft);
}

.snapshot-metrics,
.context-strip {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.snapshot-metrics span,
.context-strip span {
  max-width: 220px;
  padding: 4px 7px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-ref-list {
  display: grid;
  gap: 6px;
  max-height: 150px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-height: 28px;
  }

  span,
  small {
    color: var(--app-text-muted);
    font-size: 12px;
  }

  p {
    margin: 0;
    overflow: hidden;
    color: var(--app-text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.empty-note {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
}

.event-list {
  display: grid;
  gap: 6px;
  max-height: 180px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--app-border);
  }

  span {
    color: var(--app-primary);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
    color: var(--app-text-primary);
  }
}

.checkpoint-list {
  display: grid;
  gap: 6px;
  max-height: 180px;
  overflow: auto;

  button {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 7px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg-soft);
    color: var(--app-text-primary);
    text-align: left;
    cursor: pointer;
  }

  small {
    color: var(--app-text-muted);
  }
}

.derivative-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 132px auto;
}

.branch-strip {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg-soft);
    color: var(--app-text-secondary);
    font-size: 12px;
    cursor: pointer;
  }

  button:disabled {
    cursor: default;
    opacity: 0.58;
  }

  small {
    color: var(--app-text-muted);
  }
}

@keyframes runtimeAuraFlow {
  0% {
    transform: rotate(0deg) scale(1);
  }
  50% {
    transform: rotate(180deg) scale(1.05);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}

@keyframes runtimeProgressShimmer {
  0% {
    background-position: 0 0, -42px 0;
  }
  100% {
    background-position: 0 0, calc(100% + 42px) 0;
  }
}

@keyframes runtimeStagePulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--app-primary) 34%, transparent);
  }
  70% {
    transform: scale(1.12);
    box-shadow: 0 0 0 7px transparent;
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-runtime-active .runtime-progress-card::before,
  .is-runtime-active .runtime-progress-track span,
  .runtime-stage-list li.running > span {
    animation: none;
  }
}

@media (max-width: 760px) {
  .runtime-grid,
  .derivative-row {
    grid-template-columns: 1fr;
  }

  .runtime-stage-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
