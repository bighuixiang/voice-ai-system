<template>
  <section class="rewrite-comparison" aria-label="AI 改写对比">
    <div v-if="!result" class="empty-state">
      <strong>{{ emptyTitle }}</strong>
      <p>{{ emptyText }}</p>
      <el-button size="small" type="primary" :disabled="!canRequest" @click="$emit('request')">
        {{ requestLabel }}
      </el-button>
    </div>

    <template v-else>
      <header>
        <h3>{{ result.summary || "AI 结果" }}</h3>
        <el-tag v-if="result.parseError" type="danger">解析失败</el-tag>
      </header>

      <div class="diff-grid">
        <div class="diff-pane">
          <span class="pane-label">原文</span>
          <div class="pane-content">{{ originalText || emptyOriginalText }}</div>
        </div>
        <div class="diff-pane suggested">
          <span class="pane-label">建议稿</span>
          <div class="pane-content">{{ result.content }}</div>
        </div>
      </div>

      <div v-if="result.changes.length || diffSummary.length" class="comparison-summary">
        <div v-if="diffSummary.length">
          <strong>实际变化</strong>
          <div class="summary-chip-list">
            <span v-for="item in diffSummary" :key="item">{{ item }}</span>
          </div>
        </div>
        <div v-if="result.changes.length">
          <strong>AI 改动说明</strong>
          <ul>
            <li v-for="change in result.changes" :key="change">{{ change }}</li>
          </ul>
        </div>
      </div>

      <div v-if="result.risks.length" class="notice risk">
        <strong>风险</strong>
        <ul>
          <li v-for="risk in result.risks" :key="risk">{{ risk }}</li>
        </ul>
      </div>

      <div v-if="result.questions.length" class="notice">
        <strong>待确认</strong>
        <ul>
          <li v-for="question in result.questions" :key="question">{{ question }}</li>
        </ul>
      </div>

      <footer>
        <el-button
          v-for="option in tuneOptions"
          :key="option.value"
          size="small"
          :disabled="!canTune"
          @click="$emit('tune', option.value)"
        >
          {{ option.label }}
        </el-button>
        <el-button @click="$emit('reject')">拒绝</el-button>
        <el-button v-if="result.content" type="primary" :disabled="!canAccept" @click="$emit('accept')">{{ acceptLabel }}</el-button>
        <el-button v-if="result.patches.length" type="success" @click="$emit('apply-patches')">{{ applyPatchesLabel }}</el-button>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CodexTaskResult } from "@/types/novel";

interface TuneOption {
  label: string;
  value: string;
}

const props = withDefaults(defineProps<{
  result: CodexTaskResult | null;
  originalText?: string;
  emptyOriginalText?: string;
  acceptLabel?: string;
  applyPatchesLabel?: string;
  canAccept?: boolean;
  canTune?: boolean;
  tuneOptions?: TuneOption[];
  emptyTitle?: string;
  emptyText?: string;
  requestLabel?: string;
  canRequest?: boolean;
}>(), {
  originalText: "",
  emptyOriginalText: "当前没有选区，不能直接接受为选区改写。",
  acceptLabel: "接受选区改写",
  applyPatchesLabel: "应用补丁",
  canAccept: false,
  canTune: false,
  tuneOptions: () => [],
  emptyTitle: "暂无改写结果",
  emptyText: "选中正文后可生成候选改写。",
  requestLabel: "润色选区",
  canRequest: false
});

const diffSummary = computed(() => {
  if (!props.result?.content || !props.originalText) return [];
  const original = props.originalText;
  const next = props.result.content;
  const originalWords = original.replace(/\s+/g, "").length;
  const nextWords = next.replace(/\s+/g, "").length;
  const wordDelta = nextWords - originalWords;
  const originalParagraphs = original.split(/\n\s*\n/).filter((item) => item.trim()).length;
  const nextParagraphs = next.split(/\n\s*\n/).filter((item) => item.trim()).length;
  const lineStats = changedLineStats(original, next);
  const summary = [
    wordDelta === 0 ? `字数持平 ${nextWords}` : `字数 ${wordDelta > 0 ? "+" : ""}${wordDelta}`,
    originalParagraphs === nextParagraphs ? `段落持平 ${nextParagraphs}` : `段落 ${nextParagraphs - originalParagraphs > 0 ? "+" : ""}${nextParagraphs - originalParagraphs}`,
    `改动区 ${lineStats.removed} 行旧 / ${lineStats.added} 行新`
  ];
  if (original.trim() === next.trim()) {
    summary.unshift("候选稿与原文几乎一致");
  }
  return summary;
});

function changedLineStats(original: string, next: string) {
  const originalLines = original.split(/\r?\n/);
  const nextLines = next.split(/\r?\n/);
  let prefix = 0;
  while (prefix < originalLines.length && prefix < nextLines.length && originalLines[prefix] === nextLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix + prefix < originalLines.length &&
    suffix + prefix < nextLines.length &&
    originalLines[originalLines.length - 1 - suffix] === nextLines[nextLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    removed: Math.max(0, originalLines.length - prefix - suffix),
    added: Math.max(0, nextLines.length - prefix - suffix)
  };
}

defineEmits<{
  accept: [];
  reject: [];
  tune: [direction: string];
  "apply-patches": [];
  request: [];
}>();
</script>

<style scoped lang="scss">
.rewrite-comparison {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);

  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  footer {
    flex-wrap: wrap;
  }

  h3 {
    font-size: 15px;
    margin: 0;
    color: var(--app-text-primary);
  }
}

.empty-state {
  display: grid;
  gap: 8px;
  justify-items: start;

  strong {
    color: var(--app-text-primary);
  }

  p {
    margin: 0;
    color: var(--app-text-muted);
    font-size: 13px;
  }
}

.diff-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0;
}

.diff-pane {
  display: grid;
  grid-template-rows: auto minmax(120px, 1fr);
  min-width: 0;
}

.pane-label {
  margin-bottom: 4px;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.pane-content {
  white-space: pre-wrap;
  min-height: 140px;
  max-height: 240px;
  overflow: auto;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--app-border);
  background: var(--app-bg);
  color: var(--app-text-primary);
  line-height: 1.7;
}

.suggested .pane-content {
  border-color: var(--app-primary);
  background: var(--app-primary-soft);
}

.comparison-summary {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);

  strong {
    display: block;
    margin-bottom: 6px;
    color: var(--app-text-primary);
    font-size: 12px;
  }

  ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding-left: 18px;
    color: var(--app-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
}

.summary-chip-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;

  span {
    padding: 4px 7px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg-soft);
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
  }
}

.notice {
  margin-bottom: 10px;
  color: var(--app-text-secondary);

  &.risk {
    color: var(--app-warning);
  }

  ul {
    padding-left: 18px;
    margin: 6px 0 0;
  }
}

@media (max-width: 760px) {
  .diff-grid {
    grid-template-columns: 1fr;
  }
}
</style>
