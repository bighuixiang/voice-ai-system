<template>
  <section class="ledger-panel" aria-label="写作账本">
    <div class="panel-title">
      <span>写作账本</span>
      <el-button size="small" :loading="loading" @click="$emit('save')">保存</el-button>
    </div>

    <div class="kind-tabs" role="tablist" aria-label="账本类型">
      <button
        v-for="kind in ledgerKinds"
        :key="kind.value"
        type="button"
        :class="{ active: activeKind === kind.value }"
        @click="$emit('change-kind', kind.value)"
      >
        {{ kind.label }}
      </button>
    </div>

    <div v-if="activeKind === 'risk'" class="risk-filter" aria-live="polite">
      高优先风险 {{ priorityRiskCount }} / {{ entries.length }}
    </div>

    <div v-if="entries.length" class="entry-list">
      <article v-for="(entry, index) in entries" :key="entry.id" class="ledger-entry" :class="{ priority: isPriorityRisk(entry) }">
        <header>
          <div>
            <strong>{{ entry.title }}</strong>
            <small>{{ entry.chapterIds.join(", ") || "未绑定章节" }}</small>
          </div>
          <el-tag size="small" :type="entry.severity === 'high' ? 'danger' : entry.severity === 'medium' ? 'warning' : 'info'">
            {{ severityLabels[entry.severity] }}
          </el-tag>
        </header>

        <label>
          状态
          <select :value="entry.status" @change="updateEntry(index, { status: ($event.target as HTMLSelectElement).value as LedgerEntry['status'] })">
            <option value="open">{{ statusLabels.open }}</option>
            <option value="watch">{{ statusLabels.watch }}</option>
            <option value="resolved">{{ statusLabels.resolved }}</option>
            <option value="blocked">{{ statusLabels.blocked }}</option>
          </select>
        </label>

        <label>
          备注
          <textarea :value="entry.note" rows="3" @input="updateEntry(index, { note: ($event.target as HTMLTextAreaElement).value })" />
        </label>
      </article>
    </div>

    <p v-else class="empty-state">当前账本暂无条目。</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LedgerEntry } from "@/types/novel";

const props = defineProps<{
  entries: LedgerEntry[];
  activeKind: LedgerEntry["kind"];
  loading?: boolean;
}>();

const emit = defineEmits<{
  "change-kind": [kind: LedgerEntry["kind"]];
  "update:entries": [entries: LedgerEntry[]];
  save: [];
}>();

const ledgerKinds: Array<{ value: LedgerEntry["kind"]; label: string }> = [
  { value: "foreshadowing", label: "伏笔" },
  { value: "continuity", label: "连续性" },
  { value: "power", label: "升级" },
  { value: "character", label: "人物" },
  { value: "risk", label: "风险" }
];

const statusLabels: Record<LedgerEntry["status"], string> = {
  open: "待处理",
  watch: "观察中",
  resolved: "已解决",
  blocked: "阻塞"
};

const severityLabels: Record<LedgerEntry["severity"], string> = {
  low: "低",
  medium: "中",
  high: "高"
};

const priorityRiskCount = computed(() => props.entries.filter((entry) => isPriorityRisk(entry)).length);

function isPriorityRisk(entry: LedgerEntry) {
  return entry.kind === "risk" && (entry.status === "open" || entry.severity === "high");
}

function updateEntry(index: number, patch: Partial<LedgerEntry>) {
  emit(
    "update:entries",
    props.entries.map((entry, entryIndex) =>
      entryIndex === index
        ? {
            ...entry,
            ...patch,
            updatedAt: new Date().toISOString()
          }
        : entry
    )
  );
}
</script>

<style scoped lang="scss">
.ledger-panel {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--app-text-primary);
  font-weight: 700;
  margin-bottom: 10px;
}

.kind-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  margin-bottom: 10px;

  button {
    min-height: 30px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg-soft);
    color: var(--app-text-secondary);
    cursor: pointer;
    font-size: 12px;

    &.active {
      border-color: var(--app-primary);
      background: var(--app-primary-soft);
      color: var(--app-primary);
      font-weight: 700;
    }
  }
}

.risk-filter {
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 6px;
  background: rgba(251, 191, 36, 0.12);
  color: var(--app-warning);
  font-size: 12px;
  font-weight: 700;
}

.entry-list {
  display: grid;
  gap: 8px;
}

.ledger-entry {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);

  &.priority {
    border-color: var(--app-warning);
    background: rgba(251, 191, 36, 0.12);
  }

  header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  strong,
  small {
    display: block;
  }

  small {
    margin-top: 3px;
    color: var(--app-text-muted);
    font-size: 12px;
  }

  label {
    display: grid;
    gap: 4px;
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  select,
  textarea {
    width: 100%;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg);
    color: var(--app-text-primary);
    font: inherit;
  }

  select {
    height: 32px;
    padding: 0 8px;
  }

  textarea {
    resize: vertical;
    min-height: 70px;
    padding: 7px 8px;
  }
}

.empty-state {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg-soft);
  color: var(--app-text-muted);
}
</style>
