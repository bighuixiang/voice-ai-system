<template>
  <section class="plotpilot-learning-panel" aria-label="PlotPilot 机制沉淀">
    <div class="panel-header">
      <div>
        <p class="eyebrow">PlotPilot 机制学习</p>
        <h2>机制沉淀</h2>
      </div>
      <span>{{ doneCount }} / {{ items.length }} 已落地</span>
    </div>

    <div class="learning-grid">
      <article v-for="item in items" :key="item.id" :class="[`is-${item.status}`, { 'is-active-mechanism': item.active }]">
        <div class="item-topline">
          <strong>{{ item.label }}</strong>
          <span>{{ item.active ? "正在发挥作用" : statusLabel(item.status) }}</span>
        </div>
        <p v-if="item.activeReason" class="active-reason">{{ item.activeReason }}</p>
        <dl>
          <dt>来源机制</dt>
          <dd>{{ item.sourcePattern }}</dd>
          <dt>落地点</dt>
          <dd>{{ item.localLanding }}</dd>
          <dt>本章价值</dt>
          <dd>{{ item.userValue }}</dd>
        </dl>
        <div v-if="item.sourceRefs?.length" class="source-ref-list" aria-label="机制来源证据">
          <span v-for="ref in item.sourceRefs.slice(0, 3)" :key="ref.id">{{ ref.label }} {{ ref.value || ref.id }}</span>
        </div>
        <div class="item-footer">
          <span>{{ item.evidenceCount || 0 }} 条证据</span>
          <button v-if="item.entryCommand || item.entryAction" type="button" @click="runEntry(item)">进入</button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CreationLoopAction, PlotPilotLearningItem, WorkbenchCommand } from "@/types/novel";

const props = defineProps<{
  items: PlotPilotLearningItem[];
}>();

const emit = defineEmits<{
  action: [action: CreationLoopAction];
  command: [command: WorkbenchCommand];
}>();

const doneCount = computed(() => props.items.filter((item) => item.status === "done").length);

function statusLabel(status: PlotPilotLearningItem["status"]) {
  if (status === "done") return "已落地";
  if (status === "partial") return "部分落地";
  return "待增强";
}

function runEntry(item: PlotPilotLearningItem) {
  if (item.entryCommand) {
    emit("command", item.entryCommand);
    return;
  }
  if (item.entryAction) emit("action", item.entryAction);
}
</script>

<style scoped lang="scss">
.plotpilot-learning-panel {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
  color: var(--app-text-primary);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 15px;
    letter-spacing: 0;
  }

  > span {
    flex: 0 0 auto;
    padding: 3px 8px;
    border: 1px solid color-mix(in srgb, var(--app-primary) 30%, var(--app-border));
    border-radius: 999px;
    background: var(--app-primary-soft);
    color: var(--app-primary-text);
    font-size: 12px;
  }
}

.eyebrow {
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.learning-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

article {
  display: grid;
  gap: 8px;
  min-height: 176px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);

  &.is-done {
    border-color: color-mix(in srgb, var(--app-success-text) 42%, var(--app-border));
  }

  &.is-partial {
    border-color: color-mix(in srgb, var(--app-primary) 38%, var(--app-border));
  }

  &.is-planned {
    opacity: 0.78;
  }

  &.is-active-mechanism {
    border-color: color-mix(in srgb, var(--app-primary) 58%, var(--app-border));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--app-primary) 13%, transparent), transparent 48%),
      var(--app-bg-soft);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-primary) 18%, transparent);
  }
}

.item-topline,
.item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.item-topline {
  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--app-text-primary);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    color: var(--app-text-muted);
    font-size: 11px;
  }
}

.active-reason {
  margin: 0;
  padding: 7px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 28%, var(--app-border));
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-primary-text);
  font-size: 12px;
  line-height: 1.45;
}

dl {
  display: grid;
  gap: 4px;
  margin: 0;
}

dt {
  color: var(--app-text-muted);
  font-size: 11px;
}

dd {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.source-ref-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  span {
    min-width: 0;
    padding: 3px 6px;
    border: 1px solid var(--app-border);
    border-radius: 999px;
    background: var(--app-bg);
    color: var(--app-text-muted);
    font-size: 11px;
  }
}

.item-footer {
  align-self: end;

  span {
    color: var(--app-text-muted);
    font-size: 11px;
  }

  button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--app-primary-text);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
}

@media (max-width: 1180px) {
  .learning-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .panel-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .learning-grid {
    grid-template-columns: 1fr;
  }
}
</style>
