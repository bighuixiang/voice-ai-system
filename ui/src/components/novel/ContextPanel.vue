<template>
  <section class="context-panel" aria-label="当前上下文">
    <div class="panel-title">上下文</div>
    <dl v-if="project">
      <dt>作品</dt>
      <dd>{{ project.title }}</dd>
      <dt>题材</dt>
      <dd>{{ project.genre }}</dd>
      <dt>当前章节</dt>
      <dd>{{ chapter?.title || "未选择" }}</dd>
      <dt>AI 场景</dt>
      <dd>小说创作</dd>
      <dt>执行配置</dt>
      <dd>{{ aiSummary || "Codex CLI · 默认模型" }}</dd>
    </dl>
    <div class="agent-status" :class="{ available: aiAvailable, unavailable: aiAvailable === false }">
      {{ aiStatus || "可在顶部 AI 配置中测试连接" }}
    </div>
    <div class="context-note">
      任务会自动注入故事圣经、章纲、伏笔账本和升级节奏；局部润色只注入选区附近上下文。
    </div>
  </section>
</template>

<script setup lang="ts">
import type { NovelChapter, NovelProject } from "@/types/novel";

defineProps<{
  project: NovelProject | null;
  chapter: NovelChapter | null;
  aiSummary?: string;
  aiStatus?: string;
  aiAvailable?: boolean;
}>();
</script>

<style scoped lang="scss">
.context-panel {
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.panel-title {
  font-weight: 700;
  margin-bottom: 10px;
}

dl {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 10px;
  margin: 0;
}

dt {
  color: #6b7280;
}

dd {
  margin: 0;
  color: #111827;
}

.agent-status {
  min-height: 24px;
  margin-top: 12px;
  padding: 5px 8px;
  border-radius: 6px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  line-height: 1.3;

  &.available {
    background: #ecfdf5;
    color: #047857;
  }

  &.unavailable {
    background: #fef2f2;
    color: #991b1b;
  }
}

.context-note {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  color: #4b5563;
  line-height: 1.6;
}
</style>
