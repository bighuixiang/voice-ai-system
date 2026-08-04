<template>
  <section class="review-quality-panel" aria-label="章节体检与文风调音">
    <header>
      <div>
        <div class="panel-title">章节体检</div>
        <p>检查冲突、节奏、情绪、信息、文笔、钩子和张力。</p>
      </div>
      <el-button :disabled="!canDiagnose" @click="$emit('diagnose')">
        <el-icon><DataAnalysis /></el-icon>
        体检当前章
      </el-button>
    </header>

    <div v-if="report" class="report-body">
      <div class="score-line">
        <strong>{{ report.overallScore }}</strong>
        <span>{{ report.summary }}</span>
      </div>
      <div class="metric-list">
        <div v-for="metric in report.metrics" :key="metric.key" class="metric-item">
          <div class="metric-head">
            <span>{{ metric.label }}</span>
            <b>{{ metric.score }}</b>
          </div>
          <div class="metric-track" aria-hidden="true">
            <span :style="{ width: `${metric.score}%` }" />
          </div>
          <p>{{ metric.note }}</p>
        </div>
      </div>

      <div v-if="metricsBelowTarget.length" class="quality-upgrade">
        <div class="quality-upgrade-head">
          <div>
            <strong>超过 {{ qualityTargetScore }} 分改造清单</strong>
            <p>{{ metricsBelowTarget.length }} 个指标未超过目标线，满分 {{ qualityMaxScore }}，建议整章级改造后再复检。</p>
          </div>
          <el-button
            type="primary"
            :loading="isImprovingQuality"
            :disabled="!canImproveQuality || isImprovingQuality"
            @click="$emit('improve-all-metrics')"
          >
            <el-icon><MagicStick /></el-icon>
            一键改造全部
          </el-button>
        </div>
        <div class="quality-upgrade-list">
          <div v-for="metric in metricsBelowTarget" :key="metric.key" class="quality-upgrade-row">
            <div>
              <span>{{ metric.label }}</span>
              <p>{{ metric.note }}</p>
            </div>
            <b>
              <span>{{ metric.score }} / {{ qualityMaxScore }}</span>
              <small>目标 &gt; {{ qualityTargetScore }}</small>
            </b>
            <el-button
              size="small"
              :loading="isImprovingQuality"
              :disabled="!canImproveQuality || isImprovingQuality"
              @click="$emit('improve-metric', metric.key)"
            >
              AI改造
            </el-button>
          </div>
        </div>
      </div>
      <div v-else class="quality-upgrade passed">
        <strong>全部评分项已超过 {{ qualityTargetScore }} 分</strong>
        <p>当前已越过目标线，满分仍是 {{ qualityMaxScore }}；继续精修可追求更高上限。</p>
      </div>

      <div v-if="showQualityImprovement" class="quality-improvement">
        <div class="quality-improvement-head">
          <div>
            <strong>{{ qualityImprovementTitle }}</strong>
            <p v-if="qualityImprovement?.summary">{{ qualityImprovement.summary }}</p>
            <p v-else>从低分项生成候选稿、确认改动、应用后复检并打开版本对比。</p>
          </div>
          <div class="quality-improvement-status">
            <el-tag size="small" :type="qualityImprovementTagType">{{ qualityImprovement?.status }}</el-tag>
            <b v-if="qualityScoreDelta">{{ qualityScoreDelta }}</b>
          </div>
        </div>

        <ol class="quality-stage-list">
          <li v-for="item in qualityStageItems" :key="item.id" :class="item.status">
            <span />
            <div>
              <strong>{{ item.label }}</strong>
              <small>{{ item.detail }}</small>
            </div>
          </li>
        </ol>

        <div v-if="qualityImprovement?.targetMetrics.length" class="quality-target-strip">
          <span v-for="metric in qualityImprovement.targetMetrics" :key="metric.key">
            {{ metric.label }} {{ metric.beforeScore }} -> {{ metric.targetScore }}
          </span>
        </div>

        <div v-if="qualityImprovement?.changes.length" class="quality-change-list">
          <strong>可感知改动</strong>
          <ul>
            <li v-for="change in qualityImprovement.changes" :key="change">{{ change }}</li>
          </ul>
        </div>

        <p v-if="qualityImprovement?.error" class="quality-improvement-error">{{ qualityImprovement.error }}</p>
        <el-button
          v-if="qualityImprovement?.diffVersionId"
          size="small"
          type="primary"
          plain
          @click="$emit('open-diff')"
        >
          打开版本对比
        </el-button>
      </div>

      <div class="advice-grid">
        <div>
          <strong>亮点</strong>
          <ul>
            <li v-for="item in report.strengths" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div>
          <strong>优先修</strong>
          <ul>
            <li v-for="item in report.fixes" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>

    <p v-else class="empty-state">切到正文后，可以先体检一章再精修。</p>

    <div v-if="seriesMetrics" class="series-quality">
      <div class="series-head">
        <div>
          <div class="panel-title small">项目质量概览</div>
          <p>{{ seriesMetrics.reportCount }} / {{ seriesMetrics.chapterCount }} 章已体检</p>
        </div>
        <div class="series-actions">
          <strong>{{ seriesMetrics.averageOverallScore }}</strong>
          <el-button :icon="Refresh" :loading="isRebuildingSeries" :disabled="isRebuildingSeries" @click="$emit('rebuild-series')">
            重建
          </el-button>
        </div>
      </div>

      <div v-if="weakestSeriesMetrics.length" class="series-list">
        <div v-for="metric in weakestSeriesMetrics" :key="metric.key" class="series-item">
          <span>{{ metric.label }}</span>
          <b>{{ metric.averageScore }}</b>
        </div>
      </div>

      <p v-if="seriesMetrics.weakestChapters.length" class="series-warning">
        最弱章节：{{ seriesMetrics.weakestChapters[0].chapterTitle }} · {{ seriesMetrics.weakestChapters[0].overallScore }} 分
      </p>

      <div v-if="visibleQualityTrends.length" class="signal-block">
        <strong>质量趋势</strong>
        <div class="quality-trend-list">
          <div v-for="trend in visibleQualityTrends" :key="trend.key" class="quality-trend-row">
            <div>
              <span>{{ trend.label }}</span>
              <em>{{ trend.points.length }} 章</em>
            </div>
            <b>{{ trend.latestScore }}</b>
            <small>{{ trendLabel(trend) }}</small>
          </div>
        </div>
      </div>

      <div v-if="visibleTensionCurve.length" class="signal-block">
        <strong>张力曲线</strong>
        <div class="signal-list">
          <div v-for="point in visibleTensionCurve" :key="point.chapterId" class="signal-row">
            <span>{{ point.chapterTitle }}</span>
            <em>{{ tensionLabel(point) }}</em>
          </div>
        </div>
      </div>

      <div v-if="visibleStyleDriftSignals.length" class="signal-block">
        <strong>风格漂移</strong>
        <div class="signal-list">
          <div v-for="signal in visibleStyleDriftSignals" :key="signal.chapterId" class="signal-row">
            <span>{{ signal.chapterTitle }}</span>
            <em>{{ styleDriftLabel(signal) }}</em>
          </div>
        </div>
      </div>

      <div v-if="visibleNarrativeDebtSignals.length" class="signal-block">
        <strong>叙事债务</strong>
        <div class="signal-list">
          <div v-for="signal in visibleNarrativeDebtSignals" :key="signal.chapterId" class="signal-row">
            <span>{{ signal.chapterTitle }}</span>
            <em>{{ narrativeDebtLabel(signal) }}</em>
          </div>
        </div>
      </div>

      <div v-if="visibleCraftCoverageSignals.length" class="signal-block">
        <strong>创作技法覆盖率</strong>
        <div class="signal-list">
          <div v-for="signal in visibleCraftCoverageSignals" :key="signal.chapterId" class="signal-row">
            <span>{{ signal.chapterTitle }}</span>
            <em>{{ craftCoverageLabel(signal) }}</em>
          </div>
        </div>
      </div>

      <div v-if="visibleRhythmSignals.length" class="signal-block">
        <strong>章节节奏</strong>
        <div class="signal-list">
          <div v-for="signal in visibleRhythmSignals" :key="signal.chapterId" class="signal-row">
            <span>{{ signal.chapterTitle }}</span>
            <em>{{ rhythmLabel(signal) }}</em>
          </div>
        </div>
      </div>

      <div v-if="visibleCharacterArcSignals.length" class="signal-block">
        <strong>角色弧</strong>
        <div class="signal-list">
          <div v-for="signal in visibleCharacterArcSignals" :key="signal.characterName" class="signal-row">
            <span>{{ signal.characterName }}</span>
            <em>{{ signal.changeCount }} 次 · {{ signal.latestState }}</em>
          </div>
        </div>
      </div>
    </div>

    <div class="tone-box">
      <div class="tone-head">
        <div>
          <div class="panel-title small">文风调音台</div>
          <p>选中文本后，把这一段调到目标质感。</p>
        </div>
      </div>

      <div class="tone-controls">
        <el-select :model-value="selectedTone" @update:model-value="updateTone">
          <el-option v-for="tone in toneOptions" :key="tone.value" :label="tone.label" :value="tone.value" />
        </el-select>
        <el-button type="primary" :disabled="!canTuneSelection" @click="$emit('tune-selection')">
          <el-icon><MagicStick /></el-icon>
          调音选区
        </el-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DataAnalysis, MagicStick, Refresh } from "@element-plus/icons-vue";
import type { ChapterQualityReport, QualityImprovementState, QualityMetricKey, SeriesQualityMetrics, StyleToneKey, TaskProgressStep } from "@/types/novel";

const props = withDefaults(defineProps<{
  report: ChapterQualityReport | null;
  seriesMetrics?: SeriesQualityMetrics | null;
  selectedTone: StyleToneKey;
  canDiagnose: boolean;
  canTuneSelection: boolean;
  canImproveQuality?: boolean;
  isImprovingQuality?: boolean;
  qualityTargetScore?: number;
  qualityMaxScore?: number;
  isRebuildingSeries?: boolean;
  qualityImprovement?: QualityImprovementState;
  taskProgress?: TaskProgressStep[];
}>(), {
  canImproveQuality: false,
  isImprovingQuality: false,
  qualityTargetScore: 86,
  qualityMaxScore: 100,
  taskProgress: () => []
});

const emit = defineEmits<{
  diagnose: [];
  "update:tone": [tone: StyleToneKey];
  "tune-selection": [];
  "rebuild-series": [];
  "improve-metric": [metricKey: QualityMetricKey];
  "improve-all-metrics": [];
  "open-diff": [];
}>();

const toneOptions: Array<{ value: StyleToneKey; label: string }> = [
  { value: "elegant", label: "优雅留白" },
  { value: "restrained", label: "克制冷系" },
  { value: "tense", label: "压迫感" },
  { value: "cinematic", label: "镜头感" },
  { value: "web-serial", label: "网文爽感" },
  { value: "lower-ai", label: "降低 AI 味" }
];

const weakestSeriesMetrics = computed(() => props.seriesMetrics?.metricAverages.slice(0, 3) || []);
const visibleQualityTrends = computed(() => props.seriesMetrics?.qualityTrends?.slice(0, 4) || []);
const visibleTensionCurve = computed(() => props.seriesMetrics?.tensionCurve?.slice(0, 4) || []);
const visibleStyleDriftSignals = computed(() => props.seriesMetrics?.styleDriftSignals?.slice(0, 4) || []);
const visibleNarrativeDebtSignals = computed(() => props.seriesMetrics?.narrativeDebtSignals?.slice(0, 4) || []);
const visibleCraftCoverageSignals = computed(() => props.seriesMetrics?.craftCoverageSignals?.slice(0, 4) || []);
const visibleRhythmSignals = computed(() => props.seriesMetrics?.rhythmSignals?.slice(0, 3) || []);
const visibleCharacterArcSignals = computed(() => props.seriesMetrics?.characterArcSignals?.slice(0, 3) || []);
const metricsBelowTarget = computed(() =>
  [...(props.report?.metrics || [])]
    .filter((metric) => metric.score < props.qualityTargetScore)
    .sort((left, right) => left.score - right.score)
);
const showQualityImprovement = computed(() => Boolean(props.qualityImprovement && props.qualityImprovement.status !== "idle"));
const qualityImprovementTitle = computed(() => {
  const status = props.qualityImprovement?.status;
  const labels: Record<NonNullable<QualityImprovementState["status"]>, string> = {
    idle: "等待改造",
    preparing: "准备改造上下文",
    running: "AI 正在生成候选稿",
    candidate: "候选稿已生成",
    applying: "正在应用改动",
    reviewing: "正在重新评分",
    applied: "改造已完成",
    error: "改造需要处理"
  };
  return labels[status || "idle"];
});
const qualityImprovementTagType = computed(() => {
  const status = props.qualityImprovement?.status;
  if (status === "applied") return "success";
  if (status === "error") return "danger";
  if (status === "candidate") return "warning";
  return "info";
});
const qualityScoreDelta = computed(() => {
  const state = props.qualityImprovement;
  if (typeof state?.beforeOverallScore !== "number" || typeof state.afterOverallScore !== "number") return "";
  const delta = state.afterOverallScore - state.beforeOverallScore;
  return `${state.beforeOverallScore} -> ${state.afterOverallScore}${delta === 0 ? "（持平）" : `（${delta > 0 ? "+" : ""}${delta}）`}`;
});
const qualityStageItems = computed(() => {
  const status = props.qualityImprovement?.status || "idle";
  const order: QualityImprovementState["status"][] = ["preparing", "running", "candidate", "applying", "reviewing", "applied"];
  const currentIndex = order.indexOf(status);
  return [
    { id: "preparing", label: "准备上下文", detail: "保存当前正文并锁定低分指标" },
    { id: "running", label: "生成候选稿", detail: activeTaskProgressText.value || "调用 AI 生成整章替换候选" },
    { id: "candidate", label: "确认改动", detail: "在改写对比中检查新旧内容" },
    { id: "applying", label: "应用 patch", detail: "写入正文并保留改造前快照" },
    { id: "reviewing", label: "重新评分", detail: "应用后自动复检质量指标" },
    { id: "applied", label: "版本对比", detail: "打开快照 diff 查看实际改动" }
  ].map((item, index) => ({
    ...item,
    status:
      status === "error"
        ? index <= Math.max(0, currentIndex)
          ? "done"
          : "waiting"
        : index < currentIndex
          ? "done"
          : index === currentIndex
            ? "running"
            : "waiting"
  }));
});
const activeTaskProgressText = computed(() => {
  const running = props.taskProgress.find((step) => step.status === "running");
  if (running) return running.label;
  const failed = props.taskProgress.find((step) => step.status === "error");
  if (failed) return failed.label;
  return "";
});

function updateTone(value: string) {
  emit("update:tone", value as StyleToneKey);
}

function rhythmLabel(signal: NonNullable<SeriesQualityMetrics["rhythmSignals"]>[number]) {
  const score = typeof signal.rhythmScore === "number" ? `${signal.rhythmScore} 分` : "未评分";
  return `${score} · ${signal.wordCount} 字 · ${signal.sceneCount} 场 · ${signal.beatCount} 事件`;
}

function trendLabel(trend: NonNullable<SeriesQualityMetrics["qualityTrends"]>[number]) {
  if (typeof trend.delta !== "number") return "基线";
  if (trend.delta === 0) return "持平";
  return `${trend.delta > 0 ? "+" : ""}${trend.delta}`;
}

function tensionLabel(point: NonNullable<SeriesQualityMetrics["tensionCurve"]>[number]) {
  return `${point.tensionScore} 分 · ${point.sceneCount} 场 · ${point.note}`;
}

function styleDriftLabel(signal: NonNullable<SeriesQualityMetrics["styleDriftSignals"]>[number]) {
  const drift = signal.drift > 0 ? `+${signal.drift}` : String(signal.drift);
  const severity = signal.severity === "review" ? "需复核" : signal.severity === "watch" ? "观察" : "稳定";
  return `${severity} · ${drift} · ${signal.proseScore}/${signal.baselineScore}`;
}
function narrativeDebtLabel(signal: NonNullable<SeriesQualityMetrics["narrativeDebtSignals"]>[number]) {
  const severity = signal.severity === "blocked" ? "需交付" : signal.severity === "watch" ? "观察" : "稳定";
  return `${severity} · ${signal.debtCount} 项 · 伏笔 ${signal.openForeshadowingCount} / 风险 ${signal.riskCount} / 回路 ${signal.openLoopCount}`;
}
function craftCoverageLabel(signal: NonNullable<SeriesQualityMetrics["craftCoverageSignals"]>[number]) {
  const severity = signal.severity === "blocked" ? "blocked" : signal.severity === "watch" ? "watch" : "stable";
  return `${severity} / beats ${signal.craftBeatCount} / payoff ${signal.payoffCount} / foreshadow ${signal.foreshadowingCount} / progression ${signal.progressionCount}`;
}
</script>

<style scoped lang="scss">
.review-quality-panel {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

header,
.tone-head,
.metric-head,
.tone-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

header {
  margin-bottom: 10px;
}

.panel-title {
  color: var(--app-text-primary);
  font-weight: 800;

  &.small {
    font-size: 13px;
  }
}

p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}

.report-body {
  display: grid;
  gap: 10px;
}

.score-line {
  display: grid;
  grid-template-columns: 54px 1fr;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 7px;
  background: var(--app-bg-soft);

  strong {
    color: var(--app-success);
    font-size: 28px;
    line-height: 1;
  }

  span {
    color: var(--app-text-secondary);
    font-size: 13px;
    line-height: 1.5;
  }
}

.metric-list {
  display: grid;
  gap: 8px;
}

.metric-item {
  display: grid;
  gap: 4px;
}

.metric-head {
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.metric-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--app-bg-muted);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--app-success), var(--app-primary));
  }
}

.advice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  > div {
    padding: 9px;
    border: 1px solid var(--app-border);
    border-radius: 7px;
    background: var(--app-bg-soft);
  }

  strong {
    color: var(--app-text-primary);
    font-size: 12px;
  }

  ul {
    display: grid;
    gap: 5px;
    padding-left: 16px;
    margin: 6px 0 0;
    color: var(--app-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
}

.quality-upgrade {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--app-primary);
  border-radius: 7px;
  background: var(--app-primary-soft);
}

.quality-upgrade.passed {
  border-color: var(--app-success);
  background: var(--app-bg-soft);

  strong {
    color: var(--app-success);
    font-size: 13px;
  }
}

.quality-upgrade-head,
.quality-upgrade-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.quality-upgrade-head {
  strong {
    color: var(--app-text-primary);
    font-size: 13px;
  }
}

.quality-upgrade-list {
  display: grid;
  gap: 6px;
}

.quality-upgrade-row {
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);

  > div {
    min-width: 0;
  }

  span {
    color: var(--app-text-primary);
    font-size: 12px;
    font-weight: 800;
  }

  p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  b {
    display: grid;
    gap: 2px;
    color: var(--app-primary);
    font-size: 12px;
    text-align: right;
    white-space: nowrap;
  }

  small {
    color: var(--app-text-muted);
    font-size: 10px;
    font-weight: 700;
  }
}

.quality-improvement {
  display: grid;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

.quality-improvement-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;

  strong {
    color: var(--app-text-primary);
    font-size: 13px;
  }
}

.quality-improvement-status {
  display: grid;
  justify-items: end;
  gap: 4px;
  flex: 0 0 auto;

  b {
    color: var(--app-success-text);
    font-size: 12px;
    white-space: nowrap;
  }
}

.quality-stage-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 7px;
    align-items: start;
    min-width: 0;
    padding: 7px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg);
    color: var(--app-text-muted);
  }

  li > span {
    width: 8px;
    height: 8px;
    margin-top: 4px;
    border-radius: 999px;
    background: currentColor;
  }

  li.running {
    border-color: var(--app-primary);
    color: var(--app-primary);
  }

  li.done {
    color: var(--app-success-text);
  }

  div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

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

.quality-target-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span {
    padding: 4px 7px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg);
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
  }
}

.quality-change-list {
  display: grid;
  gap: 5px;

  strong {
    color: var(--app-text-primary);
    font-size: 12px;
  }

  ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding-left: 18px;
    color: var(--app-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
}

.quality-improvement-error {
  color: var(--app-danger-text);
}

.empty-state {
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
  color: var(--app-text-secondary);
}

.series-quality {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

.series-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  strong {
    color: var(--app-primary);
    font-size: 24px;
    line-height: 1;
  }
}

.series-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.series-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.series-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 7px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  color: var(--app-text-secondary);
  font-size: 12px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  b {
    color: var(--app-text-primary);
  }
}

.series-warning {
  color: var(--app-warning-text);
}

.signal-block {
  display: grid;
  gap: 6px;

  > strong {
    color: var(--app-text-primary);
    font-size: 12px;
  }
}

.signal-list {
  display: grid;
  gap: 5px;
}

.quality-trend-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.quality-trend-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  color: var(--app-text-secondary);
  font-size: 12px;

  div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  span,
  em,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--app-text-primary);
    font-weight: 700;
  }

  em,
  small {
    font-style: normal;
  }

  b {
    color: var(--app-primary);
    font-size: 16px;
    line-height: 1;
  }

  small {
    grid-column: 1 / -1;
    color: var(--app-text-muted);
  }
}

.signal-row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 8px;
  padding: 6px 7px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  color: var(--app-text-secondary);
  font-size: 12px;

  span,
  em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    color: var(--app-primary);
    font-style: normal;
    font-weight: 700;
  }
}

.tone-box {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
}

.tone-controls {
  align-items: stretch;

  :deep(.el-select) {
    min-width: 150px;
    flex: 1 1 auto;
  }
}

@media (max-width: 760px) {
  header,
  .tone-controls,
  .advice-grid,
  .series-list,
  .signal-row,
  .quality-stage-list {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .quality-improvement-head {
    flex-direction: column;
  }

  .quality-improvement-status {
    justify-items: start;
  }
}
</style>
