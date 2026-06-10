<template>
  <section class="task-history-panel" aria-label="任务历史">
    <div class="panel-title">任务历史</div>
    <el-empty v-if="!tasks.length" description="暂无任务" :image-size="48" />
    <ol v-else>
      <li v-for="item in visibleHistory" :key="item.task.id">
        <div class="row">
          <strong>{{ labels[item.task.type] || item.task.type }}</strong>
          <el-tag size="small" :type="statusType(item.task.status)">
            {{ statusLabel(item.task.status) }}
          </el-tag>
        </div>
        <p>{{ item.task.outputSummary || item.task.inputSummary || item.task.error }}</p>
        <details v-if="item.invocation" class="audit-detail">
          <summary>{{ auditSummary(item.invocation) }}</summary>
          <div class="audit-grid">
            <span>上下文 {{ item.invocation.contextSnapshot.blockCount }} 块 / {{ formatCount(item.invocation.contextSnapshot.totalChars) }} 字</span>
            <span>Prompt {{ formatCount(item.invocation.promptSnapshot.length) }} 字</span>
            <span>耗时 {{ formatDuration(item.invocation.attempt.durationMs) }}</span>
            <span>{{ decisionLabel(item.invocation.adoptionDecision) }}</span>
          </div>
          <div v-if="item.invocation.contextSnapshot.blocks.length" class="audit-chip-list" aria-label="上下文块">
            <span v-for="block in item.invocation.contextSnapshot.blocks.slice(0, 4)" :key="block.title">
              {{ block.title }} · {{ formatCount(block.length) }}
            </span>
          </div>
          <p v-if="item.invocation.promptSnapshot.preview" class="audit-preview">{{ item.invocation.promptSnapshot.preview }}</p>
          <div v-if="item.invocation.proposedPatchTargets.length" class="audit-chip-list" aria-label="补丁目标">
            <span v-for="target in item.invocation.proposedPatchTargets.slice(0, 4)" :key="target">{{ target }}</span>
          </div>
          <div v-if="item.invocation.acceptedPatchTargets.length" class="audit-chip-list accepted" aria-label="已采纳补丁">
            <span v-for="target in item.invocation.acceptedPatchTargets.slice(0, 4)" :key="target">{{ target }}</span>
          </div>
        </details>
        <small>{{ formatTime(item.task.finishedAt || item.task.startedAt) }}</small>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AiInvocationSession, CodexTaskType, NovelTask } from "@/types/novel";

const props = defineProps<{
  tasks: NovelTask[];
  invocations?: AiInvocationSession[];
}>();

const labels: Partial<Record<CodexTaskType, string>> = {
  "project.create": "创建项目",
  "outline.generate": "生成大纲",
  "structure.reverse": "反写结构",
  "chapter.plan": "规划章节",
  "chapter.draft": "起草正文",
  "selection.polish": "选区润色",
  "continuity.check": "连续性检查",
  "idea.suggest": "补灵感",
  "writing.briefing": "写前简报",
  "writing.recap": "写后复盘",
  "assistant.free": "自由指令"
};

const visibleHistory = computed(() =>
  props.tasks.slice(0, 10).map((task) => ({
    task,
    invocation: props.invocations?.find((item) => item.taskId === task.id)
  }))
);

function statusType(status: NovelTask["status"]) {
  if (status === "success") return "success";
  if (status === "error") return "danger";
  return "info";
}

function statusLabel(status: NovelTask["status"]) {
  const labels: Record<NovelTask["status"], string> = {
    pending: "等待",
    running: "运行中",
    success: "成功",
    error: "失败",
    cancelled: "已取消"
  };
  return labels[status];
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function decisionLabel(value: AiInvocationSession["adoptionDecision"]) {
  const labels: Record<AiInvocationSession["adoptionDecision"], string> = {
    pending: "待采纳",
    accepted: "已采纳",
    rejected: "已拒绝",
    "not-required": "无需补丁"
  };
  return labels[value];
}

function formatDuration(value?: number) {
  if (!value) return "未知";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function auditSummary(invocation: AiInvocationSession) {
  const agent = [invocation.agentProvider, invocation.modelId].filter(Boolean).join("/");
  const patches = invocation.proposedPatchTargets.length ? ` · patches ${invocation.proposedPatchTargets.length}` : "";
  return `${invocation.stageKey} · ${agent || "agent"} · ctx ${invocation.contextSnapshot.blockCount} · prompt ${formatCount(
    invocation.promptSnapshot.length
  )}${patches} · ${decisionLabel(invocation.adoptionDecision)}`;
}
</script>

<style scoped lang="scss">
.task-history-panel {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.panel-title {
  color: var(--app-text-primary);
  font-weight: 700;
  margin-bottom: 10px;
}

ol {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border);

  &:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--app-text-primary);
}

p {
  margin: 4px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}

small {
  display: block;
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.audit {
  color: var(--app-text-primary);
}

.audit-detail {
  margin-top: 5px;
  color: var(--app-text-secondary);
  font-size: 11px;

  summary {
    color: var(--app-text-primary);
    cursor: pointer;
  }
}

.audit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  margin-top: 7px;

  span {
    min-width: 0;
    overflow: hidden;
    padding: 5px 6px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg-soft);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.audit-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;

  span {
    max-width: 180px;
    overflow: hidden;
    padding: 3px 6px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg-soft);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.accepted span {
    color: var(--app-success);
  }
}

.audit-preview {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

@media (max-width: 760px) {
  .audit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
