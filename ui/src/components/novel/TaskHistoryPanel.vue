<template>
  <section class="task-history-panel" aria-label="任务历史">
    <div class="panel-title">任务历史</div>
    <el-empty v-if="!tasks.length" description="暂无任务" :image-size="48" />
    <ol v-else>
      <li v-for="task in tasks.slice(0, 10)" :key="task.id">
        <div class="row">
          <strong>{{ labels[task.type] || task.type }}</strong>
          <el-tag size="small" :type="statusType(task.status)">
            {{ statusLabel(task.status) }}
          </el-tag>
        </div>
        <p>{{ task.outputSummary || task.inputSummary || task.error }}</p>
        <small v-if="auditSummary(task)" class="audit">{{ auditSummary(task) }}</small>
        <small>{{ formatTime(task.finishedAt || task.startedAt) }}</small>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
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
    pending: "pending",
    accepted: "accepted",
    rejected: "rejected",
    "not-required": "no patch"
  };
  return labels[value];
}

function auditSummary(task: NovelTask) {
  const invocation = props.invocations?.find((item) => item.taskId === task.id);
  if (!invocation) return "";
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
</style>
