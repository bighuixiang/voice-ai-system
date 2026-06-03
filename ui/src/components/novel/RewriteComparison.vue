<template>
  <section v-if="result" class="rewrite-comparison" aria-label="AI 结果对比">
    <header>
      <h3>{{ result.summary || "AI 结果" }}</h3>
      <el-tag v-if="result.parseError" type="danger">解析失败</el-tag>
    </header>

    <div class="result-content">{{ result.content }}</div>

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
      <el-button v-if="result.content" type="primary" @click="$emit('accept')">接受选区改写</el-button>
      <el-button v-if="result.patches.length" type="success" @click="$emit('apply-patches')">应用补丁</el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { CodexTaskResult } from "@/types/novel";

defineProps<{
  result: CodexTaskResult | null;
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

  h3 {
    font-size: 15px;
    margin: 0;
    color: #1e3a8a;
  }
}

.result-content {
  white-space: pre-wrap;
  margin: 12px 0;
  padding: 12px;
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
  max-height: 240px;
  overflow: auto;
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
</style>
