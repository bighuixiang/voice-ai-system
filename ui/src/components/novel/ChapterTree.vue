<template>
  <aside class="chapter-tree" aria-label="章节列表">
    <div class="panel-title">
      <div>
        <span>章节</span>
        <small>{{ treeSummary }}</small>
      </div>
      <el-tag size="small">{{ project.chapters.length }}</el-tag>
    </div>

    <div class="chapter-search">
      <el-input
        v-model="searchQuery"
        class="search-input"
        clearable
        size="small"
        placeholder="搜索章节名、编号、状态"
        aria-label="搜索章节"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <div class="chapter-tools" aria-label="章节导航工具">
      <el-tooltip content="滚动到当前打开章节" placement="top">
        <el-button size="small" @click="scrollToActive('smooth')">
          <el-icon><Aim /></el-icon>
          定位
        </el-button>
      </el-tooltip>
      <el-tooltip :content="sortMode === 'desc' ? '当前倒序：新章节在上' : '当前正序：从第一章开始'" placement="top">
        <el-button size="small" @click="toggleSort">
          <el-icon>
            <SortDown v-if="sortMode === 'desc'" />
            <SortUp v-else />
          </el-icon>
          {{ sortMode === "desc" ? "倒序" : "正序" }}
        </el-button>
      </el-tooltip>
      <el-tooltip content="有分卷时按卷显示；无分卷时按每 100 章分段" placement="top">
        <el-button size="small" :type="groupEnabled ? 'primary' : 'default'" :disabled="Boolean(normalizedQuery)" @click="groupEnabled = !groupEnabled">
          <el-icon><Collection /></el-icon>
          分组
        </el-button>
      </el-tooltip>
    </div>

    <div
      ref="viewportRef"
      class="chapter-viewport"
      :class="{ empty: !rows.length }"
      @scroll.passive="handleScroll"
    >
      <p v-if="!rows.length" class="empty-copy">没有匹配章节。</p>
      <div v-else class="chapter-spacer" :style="{ height: `${totalHeight}px` }">
        <div
          v-for="row in visibleRows"
          :key="row.key"
          class="virtual-row"
          :style="{ transform: `translateY(${row.index * ROW_HEIGHT}px)` }"
        >
          <div v-if="row.kind === 'group'" class="chapter-group">
            <span>{{ row.title }}</span>
            <small>{{ row.count }} 章</small>
          </div>
          <button
            v-else
            class="chapter-item"
            :class="{ active: activeChapterId === row.chapter.id }"
            type="button"
            @click="$emit('open', row.chapter)"
          >
            <span class="chapter-title">{{ row.chapter.title }}</span>
            <small>{{ statusLabel(row.chapter.status) }}</small>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Aim, Collection, Search, SortDown, SortUp } from "@element-plus/icons-vue";
import type { NovelChapter, NovelProject } from "@/types/novel";

type SortMode = "asc" | "desc";

interface ChapterRow {
  kind: "chapter";
  key: string;
  index: number;
  chapter: NovelChapter;
}

interface GroupRow {
  kind: "group";
  key: string;
  index: number;
  title: string;
  count: number;
}

type VirtualRow = ChapterRow | GroupRow;
type VirtualRowDraft = Omit<ChapterRow, "index"> | Omit<GroupRow, "index">;

const ROW_HEIGHT = 48;
const OVERSCAN = 8;
const RANGE_GROUP_SIZE = 100;

const props = defineProps<{
  project: NovelProject;
  activeChapterId?: string;
}>();

defineEmits<{
  open: [chapter: NovelChapter];
}>();

const searchQuery = ref("");
const sortMode = ref<SortMode>("desc");
const groupEnabled = ref(true);
const viewportRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(420);
let scrollFrame = 0;
let resizeObserver: ResizeObserver | null = null;

const normalizedQuery = computed(() => searchQuery.value.replace(/\s+/g, "").toLowerCase());
const hasVolumeData = computed(() => props.project.chapters.some((chapter) => Boolean(chapter.volumeId || chapter.volumeTitle)));

const orderedChapters = computed(() => {
  const chapters = props.project.chapters.map((chapter, index) => ({ chapter, order: chapterOrder(chapter, index) }));
  chapters.sort((left, right) => (sortMode.value === "desc" ? right.order - left.order : left.order - right.order));
  return chapters.map((item) => item.chapter);
});

const filteredChapters = computed(() => {
  if (!normalizedQuery.value) return orderedChapters.value;
  return orderedChapters.value.filter((chapter, index) => chapterMatchesQuery(chapter, index, normalizedQuery.value));
});

const rows = computed<VirtualRow[]>(() => {
  const source = filteredChapters.value;
  if (!source.length) return [];
  if (normalizedQuery.value || !groupEnabled.value) {
    return withIndexes(source.map((chapter, index) => ({ kind: "chapter", key: chapterRowKey(chapter, index), chapter })));
  }

  const groupedRows: VirtualRowDraft[] = [];
  for (const group of buildGroups(source)) {
    groupedRows.push({
      kind: "group",
      key: `group-${group.key}`,
      title: group.title,
      count: group.chapters.length
    });
    groupedRows.push(
      ...group.chapters.map((chapter, index) => ({
        kind: "chapter" as const,
        key: `${group.key}-${chapterRowKey(chapter, index)}`,
        chapter
      }))
    );
  }
  return withIndexes(groupedRows);
});

const totalHeight = computed(() => rows.value.length * ROW_HEIGHT);
const visibleStart = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN));
const visibleEnd = computed(() =>
  Math.min(rows.value.length, Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN)
);
const visibleRows = computed(() => rows.value.slice(visibleStart.value, visibleEnd.value));
const treeSummary = computed(() => {
  if (normalizedQuery.value) return `${filteredChapters.value.length} 个结果`;
  if (hasVolumeData.value && groupEnabled.value) return "按分卷";
  if (groupEnabled.value && props.project.chapters.length > RANGE_GROUP_SIZE) return "按百章";
  return sortMode.value === "desc" ? "倒序优先" : "正序";
});

function withIndexes(items: VirtualRowDraft[]): VirtualRow[] {
  return items.map((item, index) => ({ ...item, index } as VirtualRow));
}

function chapterOrder(chapter: NovelChapter, index: number) {
  if (typeof chapter.order === "number" && Number.isFinite(chapter.order)) return chapter.order || index + 1;
  const fromId = chapter.id.match(/(\d+)/g)?.at(-1);
  const fromTitle = chapter.title.match(/(\d+)/g)?.at(-1);
  return Number(fromTitle || fromId || index + 1);
}

function chapterRowKey(chapter: NovelChapter, index: number) {
  return `${chapter.id}-${chapterOrder(chapter, index)}-${index}`;
}

function statusLabel(status: NovelChapter["status"]) {
  const labels = {
    empty: "空白",
    planned: "已规划",
    drafted: "草稿",
    checked: "已检查"
  };
  return labels[status];
}

function chapterMatchesQuery(chapter: NovelChapter, index: number, query: string) {
  const order = chapterOrder(chapter, index);
  const text = [
    chapter.title,
    chapter.id,
    String(order),
    statusLabel(chapter.status),
    chapter.volumeTitle || "",
    chapter.volumeId || ""
  ]
    .join("")
    .replace(/\s+/g, "")
    .toLowerCase();
  return text.includes(query);
}

function buildGroups(chapters: NovelChapter[]) {
  if (hasVolumeData.value) return buildVolumeGroups(chapters);
  if (chapters.length <= RANGE_GROUP_SIZE) {
    return [{ key: "all", title: "全部章节", chapters }];
  }
  return buildRangeGroups(chapters);
}

function buildVolumeGroups(chapters: NovelChapter[]) {
  const groups = new Map<string, { key: string; title: string; order: number; chapters: NovelChapter[] }>();
  props.project.chapters.forEach((chapter, index) => {
    const key = chapter.volumeId || chapter.volumeTitle || "volume-ungrouped";
    const existing = groups.get(key);
    const order = chapter.volumeOrder ?? chapterOrder(chapter, index);
    if (existing) {
      existing.order = Math.min(existing.order, order);
      return;
    }
    groups.set(key, {
      key,
      title: chapter.volumeTitle || "未分卷",
      order,
      chapters: []
    });
  });

  chapters.forEach((chapter) => {
    const key = chapter.volumeId || chapter.volumeTitle || "volume-ungrouped";
    groups.get(key)?.chapters.push(chapter);
  });

  return [...groups.values()]
    .filter((group) => group.chapters.length)
    .sort((left, right) => (sortMode.value === "desc" ? right.order - left.order : left.order - right.order));
}

function buildRangeGroups(chapters: NovelChapter[]) {
  const groups = new Map<number, { key: string; title: string; start: number; chapters: NovelChapter[] }>();
  chapters.forEach((chapter, index) => {
    const order = chapterOrder(chapter, index);
    const start = Math.floor((Math.max(1, order) - 1) / RANGE_GROUP_SIZE) * RANGE_GROUP_SIZE + 1;
    const end = start + RANGE_GROUP_SIZE - 1;
    if (!groups.has(start)) {
      groups.set(start, {
        key: `range-${start}`,
        title: `第 ${start}-${end} 章`,
        start,
        chapters: []
      });
    }
    groups.get(start)?.chapters.push(chapter);
  });
  return [...groups.values()].sort((left, right) => (sortMode.value === "desc" ? right.start - left.start : left.start - right.start));
}

function measureViewport() {
  const viewport = viewportRef.value;
  if (!viewport) return;
  viewportHeight.value = viewport.clientHeight || viewportHeight.value;
}

function handleScroll() {
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    scrollTop.value = viewportRef.value?.scrollTop || 0;
    scrollFrame = 0;
  });
}

function toggleSort() {
  sortMode.value = sortMode.value === "desc" ? "asc" : "desc";
}

async function scrollToActive(behavior: ScrollBehavior = "auto") {
  await nextTick();
  const index = rows.value.findIndex((row) => row.kind === "chapter" && row.chapter.id === props.activeChapterId);
  if (index < 0 || !viewportRef.value) return;
  setViewportScroll(Math.max(0, index * ROW_HEIGHT - ROW_HEIGHT * 2), behavior);
}

function setViewportScroll(top: number, behavior: ScrollBehavior = "auto") {
  const viewport = viewportRef.value;
  if (!viewport) return;
  const maxTop = Math.max(0, totalHeight.value - viewportHeight.value);
  const nextTop = Math.min(Math.max(0, top), maxTop);
  if (typeof viewport.scrollTo === "function") {
    viewport.scrollTo({ top: nextTop, behavior });
  } else {
    viewport.scrollTop = nextTop;
  }
  scrollTop.value = nextTop;
}

function clampViewportScroll() {
  if (!viewportRef.value) return;
  setViewportScroll(scrollTop.value);
}

onMounted(() => {
  measureViewport();
  if (typeof ResizeObserver !== "undefined" && viewportRef.value) {
    resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(viewportRef.value);
  }
  scrollToActive();
});

watch(
  () => [props.activeChapterId, props.project.slug, sortMode.value, groupEnabled.value],
  () => {
    scrollToActive();
  }
);

watch(
  () => normalizedQuery.value,
  () => {
    setViewportScroll(0);
  }
);

watch(
  () => [rows.value.length, viewportHeight.value],
  () => {
    nextTick(clampViewportScroll);
  },
  { flush: "post" }
);

onBeforeUnmount(() => {
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  resizeObserver?.disconnect();
});
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
  gap: 10px;
  padding: 0 4px 2px;
  color: #111827;

  div {
    display: grid;
    gap: 2px;
  }

  span {
    font-weight: 800;
  }

  small {
    color: #64748b;
    font-size: 12px;
  }
}

.chapter-search {
  :deep(.el-input__wrapper) {
    border-radius: 7px;
  }
}

.chapter-tools {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;

  :deep(.el-button) {
    width: 100%;
    min-width: 0;
    padding-inline: 7px;
  }
}

.chapter-viewport {
  position: relative;
  flex: 1 1 auto;
  min-height: 260px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  contain: content;

  &.empty {
    display: grid;
    place-items: start stretch;
  }
}

.chapter-spacer {
  position: relative;
  min-height: 100%;
}

.virtual-row {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 48px;
  will-change: transform;
}

.chapter-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  margin: 4px 0;
  padding: 0 8px;
  border-radius: 6px;
  background: #e8eef6;
  color: #334155;
  font-size: 12px;
  font-weight: 800;

  small {
    color: #64748b;
    font-weight: 700;
  }
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 40px;
  margin: 4px 0;
  padding: 0 12px;
  border: 1px solid #d8dee8;
  border-radius: 7px;
  background: #ffffff;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;

  small {
    color: #6b7280;
    white-space: nowrap;
  }

  &:hover,
  &:focus-visible {
    border-color: #93c5fd;
    background: #f8fbff;
    outline: none;
  }

  &:active {
    transform: translateY(1px);
  }

  &.active {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.18);
  }
}

.chapter-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-copy {
  margin: 0;
  padding: 12px;
  border-radius: 7px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .chapter-item {
    transition: none;
  }
}
</style>
