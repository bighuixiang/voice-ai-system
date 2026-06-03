<template>
  <aside class="chapter-tree" aria-label="章节列表">
    <div class="panel-title">
      <span>章节</span>
      <el-tag size="small">{{ project.chapters.length }}</el-tag>
    </div>
    <button
      v-for="chapter in project.chapters"
      :key="chapter.id"
      class="chapter-item"
      :class="{ active: activeChapterId === chapter.id }"
      type="button"
      @click="$emit('open', chapter)"
    >
      <span>{{ chapter.title }}</span>
      <small>{{ statusLabel(chapter.status) }}</small>
    </button>
  </aside>
</template>

<script setup lang="ts">
import type { NovelChapter, NovelProject } from "@/types/novel";

defineProps<{
  project: NovelProject;
  activeChapterId?: string;
}>();

defineEmits<{
  open: [chapter: NovelChapter];
}>();

function statusLabel(status: NovelChapter["status"]) {
  const labels = {
    empty: "空白",
    planned: "已规划",
    drafted: "草稿",
    checked: "已检查"
  };
  return labels[status];
}
</script>

<style scoped lang="scss">
.chapter-tree {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  color: #111827;
  padding: 0 4px 8px;
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: #ffffff;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, background-color 160ms ease;

  small {
    color: #6b7280;
    white-space: nowrap;
  }

  &:hover,
  &.active {
    border-color: #2563eb;
    background: #eff6ff;
  }
}
</style>
