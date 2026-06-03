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
      <dt>Codex</dt>
      <dd>{{ project.codex.command }}</dd>
    </dl>
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

.context-note {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  color: #4b5563;
  line-height: 1.6;
}
</style>
