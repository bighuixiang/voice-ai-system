<template>
  <section v-if="result" class="rewrite-comparison" aria-label="AI 结果对比">
    <header>
      <h3>{{ result.summary || "AI 结果" }}</h3>
      <el-tag v-if="result.parseError" type="danger">解析失败</el-tag>
    </header>

    <div class="diff-grid">
      <div class="diff-pane">
        <span class="pane-label">原文</span>
        <div class="pane-content">{{ originalText || "当前没有选区，不能直接接受为选区改写。" }}</div>
      </div>
      <div class="diff-pane suggested">
        <span class="pane-label">建议稿</span>
        <div class="pane-content">{{ result.content }}</div>
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
      <el-button @click="$emit('reject')">拒绝</el-button>
      <el-button v-if="result.content" type="primary" :disabled="!originalText" @click="$emit('accept')">接受选区改写</el-button>
      <el-button v-if="result.patches.length" type="success" @click="$emit('apply-patches')">应用补丁</el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { CodexTaskResult } from "@/types/novel";

defineProps<{
  result: CodexTaskResult | null;
  originalText?: string;
}>();

defineEmits<{
  accept: [];
  reject: [];
  "apply-patches": [];
}>();
</script>

<style scoped lang="scss">
.rewrite-comparison {
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;

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
    color: #1e3a8a;
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
  color: #1e3a8a;
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
  background: #ffffff;
  color: #111827;
  line-height: 1.7;
}

.suggested .pane-content {
  border: 1px solid #bfdbfe;
}

.notice {
  margin-bottom: 10px;
  color: #374151;

  &.risk {
    color: #92400e;
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
