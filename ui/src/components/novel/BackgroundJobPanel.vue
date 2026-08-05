<template>
  <section class="background-job-panel" aria-label="后台作业">
    <header>
      <div>
        <div class="panel-title">后台作业</div>
        <p>{{ summaryText }}</p>
      </div>
      <el-button :icon="Refresh" :loading="isLoading" @click="$emit('refresh')">刷新</el-button>
    </header>

    <div v-if="visibleJobs.length" class="job-list">
      <article v-for="job in visibleJobs" :key="job.id" class="job-row" :class="job.status">
        <div class="job-main">
          <strong>{{ typeLabel(job.type) }}</strong>
          <span>{{ userFacingText(job.outputSummary || job.error || job.inputSummary, "等待执行") }}</span>
        </div>
        <div class="job-meta">
          <el-tag size="small" :type="tagType(job.status)">{{ statusLabel(job.status) }}</el-tag>
          <small>{{ formatTime(job.updatedAt) }}<template v-if="job.durationMs"> · {{ formatDuration(job.durationMs) }}</template></small>
          <div class="job-actions">
            <el-tooltip v-if="canCancel(job)" content="取消任务" placement="top">
              <el-button circle size="small" :icon="CircleClose" @click="$emit('cancel', job.id)" />
            </el-tooltip>
            <el-tooltip v-if="canRetry(job)" content="重试任务" placement="top">
              <el-button circle size="small" :icon="RefreshRight" @click="$emit('retry', job.id)" />
            </el-tooltip>
          </div>
        </div>
      </article>
    </div>
    <p v-else class="empty-state">暂无后台作业。</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CircleClose, Refresh, RefreshRight } from "@element-plus/icons-vue";
import type { BackgroundJob, BackgroundJobStatus, BackgroundJobType } from "@/types/novel";
import { userFacingText } from "@/utils/novelLabels";

const props = defineProps<{
  jobs: BackgroundJob[];
  isLoading?: boolean;
}>();

defineEmits<{
  refresh: [];
  cancel: [jobId: string];
  retry: [jobId: string];
}>();

const jobTypeLabels: Record<BackgroundJobType, string> = {
  "knowledge.index.rebuild": "知识索引重建",
  "quality.series.rebuild": "全书质量重建",
  "story.graph.rebuild": "故事图谱重建"
};

const statusLabels: Record<BackgroundJobStatus, string> = {
  pending: "等待",
  running: "运行中",
  success: "完成",
  error: "失败",
  cancelled: "已取消"
};

const visibleJobs = computed(() => props.jobs.slice(0, 6));

const runningCount = computed(() => props.jobs.filter((job) => job.status === "pending" || job.status === "running").length);

const summaryText = computed(() => {
  if (!props.jobs.length) return "查看重建任务运行结果";
  return `${props.jobs.length} 个任务 / ${runningCount.value} 个运行中`;
});

function typeLabel(type: BackgroundJobType) {
  return jobTypeLabels[type] || type;
}

function statusLabel(status: BackgroundJobStatus) {
  return statusLabels[status] || status;
}

function tagType(status: BackgroundJobStatus) {
  if (status === "success") return "success";
  if (status === "error") return "danger";
  if (status === "running") return "warning";
  return "info";
}

function canCancel(job: BackgroundJob) {
  return job.status === "pending" || job.status === "running";
}

function canRetry(job: BackgroundJob) {
  return job.status === "error" || job.status === "cancelled";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}
</script>

<style scoped lang="scss">
.background-job-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
  color: var(--app-text-primary);
}

header,
.job-row,
.job-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

header {
  justify-content: space-between;
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

.job-list {
  display: grid;
  gap: 6px;
}

.job-row {
  justify-content: space-between;
  min-width: 0;
  min-height: 46px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-left-width: 3px;
  border-radius: 7px;
  background: var(--app-bg-soft);

  &.running {
    border-left-color: var(--app-warning-text);
  }

  &.success {
    border-left-color: var(--app-success-text);
  }

  &.error {
    border-left-color: var(--app-danger-text);
  }

  &.cancelled {
    border-left-color: var(--app-text-muted);
  }
}

.job-main {
  display: grid;
  min-width: 0;
  gap: 3px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--app-text-primary);
    font-size: 13px;
  }

  span {
    color: var(--app-text-muted);
    font-size: 12px;
  }
}

.job-meta {
  flex: 0 0 auto;
  justify-content: flex-end;

  small {
    color: var(--app-text-muted);
    font-size: 11px;
    white-space: nowrap;
  }
}

.job-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 4px;

  :deep(.el-button) {
    width: 26px;
    height: 26px;
    padding: 0;
  }
}

.empty-state {
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

@media (max-width: 760px) {
  header,
  .job-row,
  .job-meta {
    align-items: flex-start;
  }

  header,
  .job-row {
    flex-direction: column;
  }

  .job-meta {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
