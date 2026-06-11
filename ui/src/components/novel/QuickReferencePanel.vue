<template>
  <section class="quick-reference-panel" aria-label="快速参考">
    <header>
      <div>
        <div class="panel-title">快速参考</div>
        <p>{{ summaryText }}</p>
      </div>
      <el-button :icon="Search" :loading="isSearching" :disabled="!normalizedQuery" @click="runDeepSearch">深度检索</el-button>
    </header>

    <form class="reference-search" @submit.prevent="runDeepSearch">
      <input
        v-model="query"
        aria-label="快速参考关键词"
        placeholder="角色 / 地点 / 道具 / 术语 / 事实"
      />
    </form>

    <div class="reference-stats">
      <div v-for="stat in stats" :key="stat.label">
        <strong>{{ stat.count }}</strong>
        <span>{{ stat.label }}</span>
      </div>
    </div>

    <div class="reference-groups">
      <section v-for="group in visibleGroups" :key="group.kind" class="reference-group">
        <div class="group-title">
          <strong>{{ group.label }}</strong>
          <span>{{ group.items.length }}</span>
        </div>
        <div class="reference-list">
          <article v-for="item in group.items.slice(0, 5)" :key="item.id">
            <span class="item-kind">{{ item.kindLabel }}</span>
            <strong>{{ item.label }}</strong>
            <p>{{ item.summary }}</p>
            <em v-if="item.detail">{{ item.detail }}</em>
          </article>
          <p v-if="!group.items.length" class="empty-state">暂无匹配项。</p>
        </div>
      </section>
    </div>

    <section v-if="searchResult" class="deep-results" aria-label="深度检索命中">
      <div class="group-title">
        <strong>深度命中</strong>
        <span>{{ searchResult.facts.length + searchResult.triples.length + searchResult.chapters.length }}</span>
      </div>
      <div class="hit-strip">
        <span v-for="fact in searchResult.facts.slice(0, 4)" :key="fact.id">{{ fact.text }}</span>
        <span v-for="chapter in searchResult.chapters.slice(0, 4)" :key="chapter.chapterId">{{ chapter.title }}</span>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Search } from "@element-plus/icons-vue";
import type { KnowledgeIndexProjection, KnowledgeSearchResult, StoryControl } from "@/types/novel";

type ReferenceKind = "character" | "location" | "term" | "fact";

interface ReferenceItem {
  id: string;
  kind: ReferenceKind;
  kindLabel: string;
  label: string;
  summary: string;
  detail?: string;
  tokens: string[];
}

const props = defineProps<{
  storyControl: StoryControl | null;
  knowledgeIndex: KnowledgeIndexProjection | null;
  searchResult?: KnowledgeSearchResult | null;
  isSearching?: boolean;
}>();

const emit = defineEmits<{
  search: [query: string];
}>();

const query = ref("");

const normalizedQuery = computed(() => normalize(query.value));

const characterItems = computed<ReferenceItem[]>(() =>
  (props.storyControl?.characters || []).map((character) => ({
    id: `character:${character.id}`,
    kind: "character",
    kindLabel: "角色",
    label: character.name || "未命名角色",
    summary: [character.role, character.currentState, character.powerLevel].filter(Boolean).join(" / ") || "暂无状态",
    detail: character.goal || character.relationshipNotes,
    tokens: [
      character.name,
      character.role,
      character.goal,
      character.currentState,
      character.knownSecrets,
      character.relationshipNotes,
      character.powerLevel,
      character.status
    ]
  }))
);

const locationItems = computed<ReferenceItem[]>(() => {
  const locations = new Map<string, { eventTitles: string[]; chapterRanges: string[]; participants: string[] }>();
  for (const event of props.storyControl?.events || []) {
    const location = event.location.trim();
    if (!location) continue;
    const bucket = locations.get(location) || { eventTitles: [], chapterRanges: [], participants: [] };
    bucket.eventTitles.push(event.title);
    if (event.chapterRange) bucket.chapterRanges.push(event.chapterRange);
    bucket.participants.push(...event.participants);
    locations.set(location, bucket);
  }

  return Array.from(locations.entries()).map(([location, bucket]) => ({
    id: `location:${location}`,
    kind: "location",
    kindLabel: "地点",
    label: location,
    summary: unique(bucket.eventTitles).slice(0, 3).join(" / ") || "来自事件池",
    detail: unique([...bucket.chapterRanges, ...bucket.participants]).slice(0, 5).join(" / "),
    tokens: [location, ...bucket.eventTitles, ...bucket.chapterRanges, ...bucket.participants]
  }));
});

const termItems = computed<ReferenceItem[]>(() =>
  Object.entries(props.knowledgeIndex?.chapterIndex.keywords || {})
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .map(([keyword, chapterIds]) => ({
      id: `term:${keyword}`,
      kind: "term",
      kindLabel: "术语",
      label: keyword,
      summary: `${chapterIds.length} 章命中`,
      detail: chapterIds.slice(0, 5).join(" / "),
      tokens: [keyword, ...chapterIds]
    }))
);

const factItems = computed<ReferenceItem[]>(() =>
  (props.knowledgeIndex?.facts || []).map((fact) => ({
    id: `fact:${fact.id}`,
    kind: "fact",
    kindLabel: "事实",
    label: fact.relatedEntities[0] || fact.source.label || "记忆事实",
    summary: fact.text,
    detail: [...fact.relatedEntities, ...fact.chapterIds].slice(0, 6).join(" / "),
    tokens: [fact.text, fact.source.label || "", ...fact.relatedEntities, ...fact.keywords, ...fact.chapterIds]
  }))
);

const allItems = computed(() => [...characterItems.value, ...locationItems.value, ...termItems.value, ...factItems.value]);

const filteredItems = computed(() => {
  const keyword = normalizedQuery.value;
  if (!keyword) return allItems.value;
  return allItems.value.filter((item) => item.tokens.some((token) => normalize(token || "").includes(keyword)));
});

const visibleGroups = computed(() =>
  [
    { kind: "character" as const, label: "角色", items: filteredItems.value.filter((item) => item.kind === "character") },
    { kind: "location" as const, label: "地点", items: filteredItems.value.filter((item) => item.kind === "location") },
    { kind: "term" as const, label: "术语/物件", items: filteredItems.value.filter((item) => item.kind === "term") },
    { kind: "fact" as const, label: "事实", items: filteredItems.value.filter((item) => item.kind === "fact") }
  ].filter((group) => group.items.length || normalizedQuery.value)
);

const stats = computed(() => [
  { label: "角色", count: characterItems.value.length },
  { label: "地点", count: locationItems.value.length },
  { label: "术语", count: termItems.value.length },
  { label: "事实", count: factItems.value.length }
]);

const summaryText = computed(() => `${allItems.value.length} 条总控与记忆索引`);

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function runDeepSearch() {
  if (!normalizedQuery.value) return;
  emit("search", query.value.trim());
}
</script>

<style scoped lang="scss">
.quick-reference-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
  color: var(--app-text-primary);
}

header,
.group-title {
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

.reference-search input {
  width: 100%;
  min-height: 34px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  color: var(--app-text-primary);
  background: var(--app-bg);
  font-size: 12px;
  outline: none;
}

.reference-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.reference-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.reference-group,
.deep-results {
  display: grid;
  min-width: 0;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

.group-title {
  color: var(--app-text-primary);
  font-size: 12px;

  span {
    color: var(--app-primary);
    font-weight: 800;
  }
}

.reference-list {
  display: grid;
  gap: 6px;
}

.reference-list article {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);

  strong,
  p,
  em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--app-text-primary);
    font-size: 12px;
  }

  em {
    color: var(--app-primary);
    font-size: 11px;
    font-style: normal;
  }
}

.item-kind {
  width: fit-content;
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--app-primary-soft);
  color: var(--app-primary-text);
  font-size: 10px;
  font-weight: 800;
}

.hit-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span {
    max-width: 220px;
    overflow: hidden;
    padding: 5px 7px;
    border: 1px solid var(--app-border);
    border-radius: 7px;
    background: var(--app-bg);
    color: var(--app-text-secondary);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.empty-state {
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
}

@media (max-width: 760px) {
  .reference-stats,
  .reference-groups {
    grid-template-columns: 1fr;
  }
}
</style>
