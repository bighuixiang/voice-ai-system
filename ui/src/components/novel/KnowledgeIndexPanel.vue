<template>
  <section class="knowledge-index-panel" aria-label="检索记忆层">
    <header>
      <div>
        <div class="panel-title">检索记忆层</div>
        <p>{{ summaryText }}</p>
      </div>
      <el-button :icon="Refresh" :loading="isRebuilding" @click="$emit('rebuild')">重建</el-button>
    </header>

    <div v-if="index" class="index-body">
      <div class="index-stats">
        <div>
          <strong>{{ index.facts.length }}</strong>
          <span>事实</span>
        </div>
        <div>
          <strong>{{ index.triples.length }}</strong>
          <span>三元组</span>
        </div>
        <div>
          <strong>{{ indexedChapterCount }}</strong>
          <span>章节</span>
        </div>
      </div>

      <div class="keyword-strip" v-if="visibleKeywords.length">
        <span v-for="keyword in visibleKeywords" :key="keyword">{{ keyword }}</span>
      </div>

      <div class="chapter-list">
        <div v-for="chapter in visibleChapters" :key="chapter.chapterId" class="chapter-row">
          <span>{{ chapter.title }}</span>
          <em>{{ chapter.factIds.length }} facts</em>
        </div>
        <p v-if="!visibleChapters.length" class="empty-state">暂无章节索引。</p>
      </div>
    </div>
    <p v-else class="empty-state">暂无检索索引，可手动重建。</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import type { KnowledgeIndexProjection } from "@/types/novel";

const props = defineProps<{
  index: KnowledgeIndexProjection | null;
  isRebuilding: boolean;
}>();

defineEmits<{
  rebuild: [];
}>();

const indexedChapterCount = computed(() => props.index?.chapterIndex.chapters.filter((chapter) => chapter.factIds.length).length || 0);

const visibleKeywords = computed(() => Object.keys(props.index?.chapterIndex.keywords || {}).slice(0, 12));

const visibleChapters = computed(() => (props.index?.chapterIndex.chapters || []).filter((chapter) => chapter.factIds.length).slice(0, 8));

const summaryText = computed(() => {
  if (!props.index) return "从章节摘要、台账和故事总控重建";
  return `${props.index.facts.length} 个事实 / ${props.index.triples.length} 条关系`;
});
</script>

<style scoped lang="scss">
.knowledge-index-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

header,
.chapter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-title {
  color: #111827;
  font-size: 14px;
  font-weight: 800;
}

p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 12px;
}

.index-body {
  display: grid;
  gap: 10px;
}

.index-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;

  div {
    display: grid;
    min-width: 0;
    gap: 2px;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    background: #f8fafc;
  }

  strong {
    color: #0f172a;
    font-size: 17px;
    line-height: 1;
  }

  span {
    color: #64748b;
    font-size: 11px;
  }
}

.keyword-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span {
    max-width: 150px;
    overflow: hidden;
    padding: 4px 7px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    color: #334155;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.chapter-list {
  display: grid;
  gap: 5px;
}

.chapter-row {
  min-width: 0;
  min-height: 34px;
  padding: 7px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  color: #0f172a;
  font-size: 12px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    flex: 0 0 auto;
    color: #2563eb;
    font-style: normal;
    font-weight: 700;
  }
}

.empty-state {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #f8fafc;
}

@media (max-width: 760px) {
  .index-stats {
    grid-template-columns: 1fr;
  }
}
</style>
