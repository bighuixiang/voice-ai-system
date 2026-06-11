<template>
  <section class="audit-report-panel" aria-label="Audit report preview">
    <header class="audit-header">
      <div>
        <div class="panel-title">Audit Report</div>
        <p v-if="report">{{ report.projectTitle }} · {{ formatTime(report.generatedAt) }}</p>
        <p v-else>Project runtime, memory, quality, and automation summary.</p>
      </div>
      <div class="panel-actions">
        <el-button :loading="loading" @click="$emit('refresh')">Refresh</el-button>
        <el-button :disabled="!report" @click="$emit('download')">Download JSON</el-button>
      </div>
    </header>

    <el-empty v-if="!report" description="No audit report loaded" :image-size="48" />

    <div v-else class="report-body">
      <section class="metric-strip" aria-label="Audit summary">
        <div>
          <span>Chapters</span>
          <strong>{{ report.chapters.length }} chapters</strong>
        </div>
        <div>
          <span>Quality</span>
          <strong>{{ report.quality.averageOverallScore }}</strong>
          <small>{{ report.quality.reportCount }}/{{ report.quality.chapterCount }} reviewed</small>
        </div>
        <div>
          <span>Tasks</span>
          <strong>{{ report.taskSummary.total }} tasks</strong>
          <small>{{ report.taskSummary.byStatus.success || 0 }} success / {{ report.taskSummary.byStatus.error || 0 }} error</small>
        </div>
        <div>
          <span>AI Audit</span>
          <strong>{{ report.aiInvocationSummary.total }} invocations</strong>
          <small>{{ report.aiInvocationSummary.byDecision.accepted }} accepted</small>
        </div>
      </section>

      <section class="detail-grid" aria-label="Audit details">
        <article>
          <div class="section-title">Knowledge</div>
          <div class="fact-row">
            <span>Facts</span>
            <strong>{{ report.knowledgeSummary.factCount }}</strong>
          </div>
          <div class="fact-row">
            <span>Triples</span>
            <strong>{{ report.knowledgeSummary.tripleCount }}</strong>
          </div>
          <div class="fact-row">
            <span>Keywords</span>
            <strong>{{ report.knowledgeSummary.keywordCount }}</strong>
          </div>
          <div class="vector-line">
            <el-tag size="small">{{ vectorLabel }}</el-tag>
            <span>{{ vectorEntryLabel }}</span>
          </div>
        </article>

        <article>
          <div class="section-title">Runtime</div>
          <div class="fact-row">
            <span>Tracked chapters</span>
            <strong>{{ report.runtimeSummary.chapterCount }}</strong>
          </div>
          <div class="fact-row">
            <span>Blocked steps</span>
            <strong>{{ report.runtimeSummary.blockedStepCount }} blocked</strong>
          </div>
          <div class="step-list">
            <span v-for="item in activeStepRows" :key="item.id">{{ item.id }} {{ item.count }}</span>
          </div>
        </article>

        <article>
          <div class="section-title">Background Jobs</div>
          <div class="fact-row">
            <span>Total</span>
            <strong>{{ report.backgroundJobSummary.total }} jobs</strong>
          </div>
          <div class="fact-row">
            <span>Running</span>
            <strong>{{ report.backgroundJobSummary.byStatus.running || 0 }}</strong>
          </div>
          <div class="job-list">
            <div v-for="job in report.backgroundJobSummary.latestJobs.slice(0, 4)" :key="job.id">
              <span>{{ job.type }}</span>
              <strong>{{ job.outputSummary || job.error || job.status }}</strong>
            </div>
          </div>
        </article>

        <article>
          <div class="section-title">Adoption</div>
          <div class="fact-row">
            <span>Proposed patches</span>
            <strong>{{ report.aiInvocationSummary.proposedPatchCount }}</strong>
          </div>
          <div class="fact-row">
            <span>Accepted patches</span>
            <strong>{{ report.aiInvocationSummary.acceptedPatchCount }}</strong>
          </div>
          <div class="step-list">
            <span v-for="item in adoptionRows" :key="item.id">{{ item.id }} {{ item.count }}</span>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ProjectAuditReport } from "@/types/novel";

const props = defineProps<{
  report: ProjectAuditReport | null;
  loading?: boolean;
}>();

defineEmits<{
  refresh: [];
  download: [];
}>();

const vectorLabel = computed(() => props.report?.knowledgeSummary.vectorSummary?.provider || "no-vector");
const vectorEntryLabel = computed(() => {
  const entryCount = props.report?.knowledgeSummary.vectorSummary?.entryCount;
  return typeof entryCount === "number" ? `${entryCount} vectors` : "0 vectors";
});

const activeStepRows = computed(() =>
  Object.entries(props.report?.runtimeSummary.byActiveStep || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }))
);

const adoptionRows = computed(() =>
  Object.entries(props.report?.aiInvocationSummary.byDecision || {}).map(([id, count]) => ({ id, count }))
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
