<template>
  <section class="task-history-panel" aria-label="任务历史">
    <div class="panel-title">任务历史</div>
    <el-empty v-if="!tasks.length" description="暂无任务" :image-size="48" />
    <ol v-else>
      <li v-for="task in tasks.slice(0, 8)" :key="task.id">
        <div class="row">
          <strong>{{ labels[task.type] || task.type }}</strong>
          <el-tag size="small" :type="task.status === 'success' ? 'success' : task.status === 'error' ? 'danger' : 'info'">
            {{ task.status }}
          </el-tag>
        </div>
        <p>{{ task.outputSummary || task.inputSummary || task.error }}</p>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import type { CodexTaskType, NovelTask } from "@/types/novel";

defineProps<{
  tasks: NovelTask[];
}>();

const labels: Partial<Record<CodexTaskType, string>> = {
  "project.create": "创建项目",
  "outline.generate": "生成大纲",
  "chapter.plan": "规划章节",
  "chapter.draft": "起草正文",
  "selection.polish": "选区润色",
  "continuity.check": "连续性检查",
  "idea.suggest": "补灵感"
};

labels["assistant.free"] = "自由指令";
</script>

<style scoped lang="scss">
.task-history-panel {
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.panel-title {
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
  border-bottom: 1px solid #eef2f7;

  &:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 12px;
}
</style>
