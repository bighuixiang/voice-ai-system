<template>
  <section class="audit-report-panel" aria-label="审计报告预览">
    <header class="audit-header">
      <div>
        <div class="panel-title">审计报告</div>
        <p v-if="report">{{ report.projectTitle }} · {{ formatTime(report.generatedAt) }}</p>
        <p v-else>项目运行时、记忆、质量与自动化汇总。</p>
      </div>
      <div class="panel-actions">
        <el-button :loading="loading" @click="$emit('refresh')">刷新</el-button>
        <el-button :disabled="!report" @click="$emit('download')">下载 JSON</el-button>
      </div>
    </header>

    <el-empty v-if="!report" description="尚未加载审计报告" :image-size="48" />

    <div v-else class="report-body">
      <section class="metric-strip" aria-label="审计摘要">
        <div>
          <span>章节</span>
          <strong>{{ report.chapters.length }} 章</strong>
        </div>
        <div>
          <span>质量</span>
          <strong>{{ report.quality.averageOverallScore }}</strong>
          <small>{{ report.quality.reportCount }}/{{ report.quality.chapterCount }} 已体检</small>
        </div>
        <div>
          <span>任务</span>
          <strong>{{ report.taskSummary.total }} 个任务</strong>
          <small>{{ report.taskSummary.byStatus.success || 0 }} 成功 / {{ report.taskSummary.byStatus.error || 0 }} 失败</small>
        </div>
        <div>
          <span>AI 审计</span>
          <strong>{{ report.aiInvocationSummary.total }} 次调用</strong>
          <small>{{ report.aiInvocationSummary.byDecision.accepted }} 已采纳</small>
        </div>
      </section>

      <section class="detail-grid" aria-label="审计详情">
        <article>
          <div class="section-title">知识</div>
          <div class="fact-row">
            <span>事实</span>
            <strong>{{ report.knowledgeSummary.factCount }}</strong>
          </div>
          <div class="fact-row">
            <span>三元组</span>
            <strong>{{ report.knowledgeSummary.tripleCount }}</strong>
          </div>
          <div class="fact-row">
            <span>关键词</span>
            <strong>{{ report.knowledgeSummary.keywordCount }}</strong>
          </div>
          <div class="vector-line">
            <el-tag size="small">{{ vectorLabel }}</el-tag>
            <span>{{ vectorEntryLabel }}</span>
          </div>
        </article>

        <article>
          <div class="section-title">运行时</div>
          <div class="fact-row">
            <span>跟踪章节</span>
            <strong>{{ report.runtimeSummary.chapterCount }}</strong>
          </div>
          <div class="fact-row">
            <span>阻塞步骤</span>
            <strong>{{ report.runtimeSummary.blockedStepCount }} 个阻塞</strong>
          </div>
          <div class="step-list">
            <span v-for="item in activeStepRows" :key="item.id">{{ item.id }} {{ item.count }}</span>
          </div>
        </article>

        <article>
          <div class="section-title">后台任务</div>
          <div class="fact-row">
            <span>总数</span>
            <strong>{{ report.backgroundJobSummary.total }} 个任务</strong>
          </div>
          <div class="fact-row">
            <span>运行中</span>
            <strong>{{ report.backgroundJobSummary.byStatus.running || 0 }}</strong>
          </div>
          <div class="job-list">
            <div v-for="job in report.backgroundJobSummary.latestJobs.slice(0, 4)" :key="job.id">
              <span>{{ operationTypeLabel(job.type) }}</span>
              <strong>{{ userFacingText(job.outputSummary || job.error, statusLabel(job.status)) }}</strong>
            </div>
          </div>
        </article>

        <article>
          <div class="section-title">任务健康</div>
          <div class="fact-row">
            <span>失败 / 已取消</span>
            <strong>{{ taskFailureCount }}</strong>
          </div>
          <div class="fact-row">
            <span>设置超时预算</span>
            <strong>{{ timeoutTaskCount }}</strong>
          </div>
          <div class="job-list">
            <div v-for="task in unhealthyTasks.slice(0, 4)" :key="task.id">
              <span>{{ operationTypeLabel(task.type) }}</span>
              <strong>{{ taskHealthLabel(task) }}</strong>
            </div>
          </div>
        </article>

        <article>
          <div class="section-title">采纳</div>
          <div class="fact-row">
            <span>提议补丁</span>
            <strong>{{ report.aiInvocationSummary.proposedPatchCount }}</strong>
          </div>
          <div class="fact-row">
            <span>已采纳补丁</span>
            <strong>{{ report.aiInvocationSummary.acceptedPatchCount }}</strong>
          </div>
          <div class="step-list">
            <span v-for="item in adoptionRows" :key="item.id">{{ item.id }} {{ item.count }}</span>
          </div>
        </article>

        <article
          id="audit-ai-control-plane"
          ref="aiControlPlaneRef"
          :class="{ 'is-focus-highlight': focusSection === 'ai-control-plane' && focusHighlightActive }"
        >
          <div class="section-title">AI 调用控制面板</div>
          <div class="fact-row">
            <span>调用前预警</span>
            <strong>{{ preCallWarningTotal }}</strong>
          </div>
          <div class="fact-row">
            <span>上下文压缩</span>
            <strong>{{ report.aiInvocationSummary.truncatedContextBlocks.length }} 个块</strong>
          </div>
          <div class="step-list">
            <span v-for="item in tierRows" :key="item.id">{{ item.id }} {{ item.count }}</span>
          </div>
          <div class="step-list">
            <span v-for="item in promptVersionRows.slice(0, 3)" :key="item.id">{{ item.id }} {{ item.count }}</span>
          </div>
          <div class="step-list warning-list">
            <span v-for="item in preCallWarningRows.slice(0, 3)" :key="item.id">{{ item.id }} {{ item.count }}</span>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { NovelTask, ProjectAuditReport } from "@/types/novel";
import { operationTypeLabel, statusLabel, userFacingText } from "@/utils/novelLabels";

const props = defineProps<{
  report: ProjectAuditReport | null;
  loading?: boolean;
  focusSection?: "ai-control-plane" | null;
}>();

defineEmits<{
  refresh: [];
  download: [];
}>();

const vectorLabel = computed(() => props.report?.knowledgeSummary.vectorSummary?.provider || "未启用向量");
const vectorEntryLabel = computed(() => {
  const entryCount = props.report?.knowledgeSummary.vectorSummary?.entryCount;
  return typeof entryCount === "number" ? `${entryCount} 个向量` : "0 个向量";
});

const activeStepRows = computed(() =>
  Object.entries(props.report?.runtimeSummary.byActiveStep || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }))
);

const adoptionRows = computed(() =>
  Object.entries(props.report?.aiInvocationSummary.byDecision || {}).map(([id, count]) => ({ id, count }))
);

const tierRows = computed(() =>
  (["T0", "T1", "T2", "T3"] as const).map((id) => ({ id, count: props.report?.aiInvocationSummary.contextTierTotals[id] || 0 }))
);

const promptVersionRows = computed(() =>
  Object.entries(props.report?.aiInvocationSummary.promptVersions || {})
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
);

const preCallWarningRows = computed(() =>
  Object.entries(props.report?.aiInvocationSummary.preCallWarnings || {})
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
);

const preCallWarningTotal = computed(() => preCallWarningRows.value.reduce((sum, item) => sum + item.count, 0));
const taskFailureCount = computed(
  () => (props.report?.taskSummary.byStatus.error || 0) + (props.report?.taskSummary.byStatus.cancelled || 0)
);
const timeoutTaskCount = computed(() => (props.report?.taskSummary.latestTasks || []).filter((task) => task.timeoutMs).length);
const unhealthyTasks = computed(() =>
  (props.report?.taskSummary.latestTasks || []).filter(
    (task) => task.status === "error" || task.status === "cancelled" || Boolean(task.cancelRequestedAt)
  )
);
const aiControlPlaneRef = ref<HTMLElement | null>(null);
const focusHighlightActive = ref(false);

watch(
  () => [props.focusSection, props.report?.generatedAt],
  async () => {
    if (props.focusSection !== "ai-control-plane" || !props.report) return;
    await nextTick();
    aiControlPlaneRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
    focusHighlightActive.value = true;
    window.setTimeout(() => {
      focusHighlightActive.value = false;
    }, 1800);
  },
  { immediate: true }
);

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(value?: number) {
  if (!value) return "";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function taskHealthLabel(task: Pick<NovelTask, "status" | "error" | "durationMs" | "timeoutMs" | "cancelRequestedAt">) {
  const parts: string[] = [taskStatusLabel(task.status)];
  const duration = formatDuration(task.durationMs);
  if (duration) parts.push(duration);
  if (task.timeoutMs) parts.push(`超时预算 ${formatDuration(task.timeoutMs)}`);
  if (task.cancelRequestedAt) parts.push("已请求取消");
  if (task.error) parts.push(userFacingText(task.error));
  return parts.join(" · ");
}

function taskStatusLabel(status: NovelTask["status"]) {
  const labels: Partial<Record<NovelTask["status"], string>> = {
    pending: "排队中",
    running: "运行中",
    success: "成功",
    error: "失败",
    cancelled: "已取消"
  };
  return labels[status] || status;
}
</script>

<style scoped lang="scss">
.audit-report-panel {
  display: grid;
  gap: 14px;
  color: var(--app-text-primary);
}

.audit-header,
.panel-actions {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.audit-header {
  justify-content: space-between;

  p {
    margin: 4px 0 0;
    color: var(--app-text-muted);
    font-size: 13px;
  }
}

.panel-title,
.section-title {
  font-weight: 800;
}

.panel-title {
  font-size: 16px;
}

.panel-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.report-body {
  display: grid;
  gap: 12px;
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  div {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--app-border);
    border-radius: 8px;
    background: var(--app-bg-soft);
  }

  span,
  small {
    color: var(--app-text-muted);
    font-size: 12px;
  }

  strong {
    overflow: hidden;
    font-size: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  article {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--app-border);
    border-radius: 8px;
    background: var(--app-bg);
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      background 180ms ease;

    &.is-focus-highlight {
      border-color: var(--app-primary);
      background: var(--app-primary-soft);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-primary) 24%, transparent);
    }
  }
}

.fact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--app-text-secondary);
  font-size: 13px;

  strong {
    color: var(--app-text-primary);
  }
}

.vector-line,
.step-list,
.job-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.vector-line {
  align-items: center;
  color: var(--app-text-muted);
  font-size: 12px;
}

.step-list span,
.job-list div {
  min-width: 0;
  padding: 5px 7px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
}

.warning-list span {
  border-color: color-mix(in srgb, var(--app-warning-text) 45%, var(--app-border));
  color: var(--app-warning-text);
}

.job-list {
  flex-direction: column;

  div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }

  span,
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 900px) {
  .metric-strip,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .audit-header {
    flex-direction: column;
  }
}
</style>
