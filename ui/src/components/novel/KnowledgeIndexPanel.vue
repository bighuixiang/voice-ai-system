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

      <div v-if="vectorSummary" class="vector-summary">
        <span>{{ vectorProviderText }}</span>
        <em>{{ vectorDetailText }}</em>
        <small v-if="vectorFallbackText">{{ vectorFallbackText }}</small>
      </div>

      <form class="search-form" @submit.prevent="submitSearch">
        <input v-model="searchQuery" aria-label="知识检索关键词" placeholder="关键词 / 角色 / 地点 / 伏笔" />
        <button type="submit" :disabled="isSearching || !searchQuery.trim()">
          {{ isSearching ? "检索中" : "检索" }}
        </button>
      </form>

      <div v-if="searchResult" class="search-results">
        <div class="result-header">
          <span>“{{ searchResult.query }}”</span>
          <em>{{ searchResult.facts.length }} 条事实 / {{ searchResult.triples.length }} 条关系 / {{ vectorHitCount }} 条向量命中</em>
        </div>
        <div v-if="searchResult.retrievalAudit" class="retrieval-audit" aria-label="检索审计">
          <strong>检索审计</strong>
          <span>可用 {{ searchResult.retrievalAudit.eligibleFactIds.length }} 条 / 已排除 {{ searchResult.retrievalAudit.excluded.length }} 条</span>
          <span v-if="searchResult.retrievalAudit.boundary.task">任务：{{ searchResult.retrievalAudit.boundary.task }}</span>
          <span>独立来源 {{ searchResult.retrievalAudit.evidenceProfile?.independentSourceCount ?? searchResult.retrievalAudit.evidenceSourceCount }} 个</span>
          <small v-if="searchResult.retrievalAudit.evidenceProfile?.gaps.length">证据缺口：{{ searchResult.retrievalAudit.evidenceProfile.gaps.join(", ") }}</small>
          <small>指纹 {{ searchResult.retrievalAudit.resultFingerprint.slice(0, 12) }}</small>
          <small v-if="searchResult.queryEmbeddingFallback">查询向量降级：{{ userFacingText(searchResult.queryEmbeddingFallback.reason, "未说明原因") }}</small>
          <small v-if="retrievalPreviewId">已保存预览：{{ retrievalPreviewId }}</small>
        </div>
        <div v-if="searchResult.facts.length" class="result-list">
          <article v-for="fact in searchResult.facts.slice(0, 5)" :key="fact.id">
            <strong>{{ fact.text }}</strong>
            <span>{{ fact.relatedEntities.join(" / ") || sourceTypeLabel(fact.source.type) }} · 向量 {{ formatScore(fact.vectorScore) }}</span>
          </article>
        </div>
        <div v-if="searchResult.triples.length" class="triple-list">
          <span v-for="triple in searchResult.triples.slice(0, 5)" :key="triple.id">
            {{ triple.subject }} · {{ triple.predicate }} · {{ triple.object }}
          </span>
        </div>
        <div v-if="searchResult.chapters.length" class="chapter-hits">
          <span v-for="chapter in searchResult.chapters.slice(0, 6)" :key="chapter.chapterId">{{ chapter.title }}</span>
        </div>
        <p v-if="!searchResult.facts.length && !searchResult.triples.length" class="empty-state">没有命中事实或关系。</p>
      </div>

      <div v-if="retrievalPreview && !searchResult" class="retrieval-audit retrieval-preview-recovery" aria-label="已保存的检索预览">
        <strong>已保存的检索预览</strong>
        <span>预览 {{ retrievalPreview.retrievalId }}</span>
        <span>已选择 {{ retrievalPreview.selectedIds.length }} 条 / 已截断 {{ retrievalPreview.truncatedIds.length }} 条</span>
        <small>指纹 {{ retrievalPreview.resultFingerprint.slice(0, 12) }}</small>
      </div>

      <div class="keyword-strip" v-if="visibleKeywords.length">
        <span v-for="keyword in visibleKeywords" :key="keyword">{{ keyword }}</span>
      </div>

      <div class="chapter-list">
        <div v-for="chapter in visibleChapters" :key="chapter.chapterId" class="chapter-row">
          <span>{{ chapter.title }}</span>
          <em>{{ chapter.factIds.length }} 条事实</em>
        </div>
        <p v-if="!visibleChapters.length" class="empty-state">暂无章节索引。</p>
      </div>
    </div>
    <p v-else class="empty-state">暂无检索索引，可手动重建。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import type { KnowledgeIndexProjection, KnowledgeSearchResult, MemoryRetrievalPreview } from "@/types/novel";
import { sourceTypeLabel, userFacingText } from "@/utils/novelLabels";

const props = defineProps<{
  index: KnowledgeIndexProjection | null;
  isRebuilding: boolean;
  searchResult?: KnowledgeSearchResult | null;
  retrievalPreview?: MemoryRetrievalPreview | null;
  isSearching?: boolean;
}>();

const emit = defineEmits<{
  rebuild: [];
  search: [query: string];
}>();

const searchQuery = ref("");

const indexedChapterCount = computed(() => props.index?.chapterIndex.chapters.filter((chapter) => chapter.factIds.length).length || 0);

const visibleKeywords = computed(() => Object.keys(props.index?.chapterIndex.keywords || {}).slice(0, 12));

const visibleChapters = computed(() => (props.index?.chapterIndex.chapters || []).filter((chapter) => chapter.factIds.length).slice(0, 8));

const vectorSummary = computed(() => props.index?.vectorSummary || props.searchResult?.vectorSummary || null);

const vectorProviderText = computed(() => {
  if (!vectorSummary.value) return "";
  const model = vectorSummary.value.model ? ` / ${vectorSummary.value.model}` : "";
  return `向量检索：${vectorSummary.value.provider}${model}`;
});

const vectorDetailText = computed(() => {
  if (!vectorSummary.value) return "";
  return `${vectorSummary.value.entryCount} 条记录 / ${vectorSummary.value.dimensions} 维`;
});

const vectorFallbackText = computed(() => {
  if (!vectorSummary.value?.fallbackFrom) return "";
  return `已从 ${vectorSummary.value.fallbackFrom} 降级：${vectorSummary.value.fallbackReason || "服务不可用"}`;
});

const vectorHitCount = computed(() => {
  if (!props.searchResult) return 0;
  return [...props.searchResult.facts, ...props.searchResult.triples, ...props.searchResult.chapters].filter((item) => (item.vectorScore || 0) > 0).length;
});

const retrievalPreviewId = computed(() => props.retrievalPreview?.retrievalId || "");

const summaryText = computed(() => {
  if (!props.index) return "从章节摘要、台账和故事总控重建";
  return `${props.index.facts.length} 个事实 / ${props.index.triples.length} 条关系`;
});

function submitSearch() {
  const query = searchQuery.value.trim();
  if (!query) return;
  emit("search", query);
}

function formatScore(score?: number) {
  return score ? score.toFixed(2) : "0.00";
}
</script>

<style scoped lang="scss">
.knowledge-index-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
  color: var(--app-text-primary);
}

header,
.chapter-row,
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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
    border: 1px solid var(--app-border);
    border-radius: 7px;
    background: var(--app-bg-soft);
  }

  strong {
    color: var(--app-text-primary);
    font-size: 17px;
    line-height: 1;
  }

  span {
    color: var(--app-text-muted);
    font-size: 11px;
  }
}

.vector-summary {
  display: grid;
  gap: 3px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 28%, var(--app-border));
  border-radius: 7px;
  background: var(--app-primary-soft);
  color: var(--app-text-secondary);
  font-size: 12px;

  span {
    color: var(--app-text-primary);
    font-weight: 800;
  }

  em {
    color: var(--app-primary);
    font-style: normal;
    font-weight: 700;
  }

  small {
    color: var(--app-warning-text);
    font-size: 11px;
  }
}

.retrieval-audit {
  display: grid;
  gap: 3px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
  color: var(--app-text-muted);
  font-size: 11px;

  strong {
    color: var(--app-text-primary);
    font-size: 12px;
  }

  small {
    color: var(--app-warning-text);
  }
}

.search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;

  input,
  button {
    min-height: 34px;
    border-radius: 7px;
    font-size: 12px;
  }

  input {
    min-width: 0;
    padding: 0 10px;
    border: 1px solid var(--app-border);
    color: var(--app-text-primary);
    background: var(--app-bg);
    outline: none;
  }

  button {
    padding: 0 12px;
    border: 1px solid var(--app-primary);
    background: var(--app-primary);
    color: var(--app-bg);
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    border-color: var(--app-border);
    background: var(--app-bg-muted);
    color: var(--app-text-muted);
    cursor: not-allowed;
  }
}

.search-results {
  display: grid;
  gap: 8px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 28%, var(--app-border));
  border-radius: 7px;
  background: var(--app-primary-soft);
}

.result-header {
  color: var(--app-text-primary);
  font-size: 12px;
  font-weight: 800;

  em {
    color: var(--app-primary);
    font-style: normal;
    font-weight: 700;
  }
}

.result-list,
.triple-list,
.chapter-hits {
  display: grid;
  gap: 5px;
}

.result-list article {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--app-text-primary);
    font-size: 12px;
  }

  span {
    color: var(--app-text-muted);
    font-size: 11px;
  }
}

.triple-list span,
.chapter-hits span {
  min-width: 0;
  overflow: hidden;
  padding: 5px 7px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  color: var(--app-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keyword-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span {
    max-width: 150px;
    overflow: hidden;
    padding: 4px 7px;
    border: 1px solid var(--app-border);
    border-radius: 7px;
    color: var(--app-text-secondary);
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
  border: 1px solid var(--app-border);
  border-radius: 7px;
  color: var(--app-text-primary);
  font-size: 12px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    flex: 0 0 auto;
    color: var(--app-primary);
    font-style: normal;
    font-weight: 700;
  }
}

.empty-state {
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

@media (max-width: 760px) {
  .index-stats,
  .search-form {
    grid-template-columns: 1fr;
  }
}
</style>
