<template>
  <section class="book-run-panel" data-testid="book-run-panel" aria-labelledby="book-run-title">
    <header class="panel-header">
      <div><p class="eyebrow">整书编排</p><h2 id="book-run-title">整书工作流</h2><p>工作范围、自治等级和运行状态由服务端持久化；推进不会绕过章节执行门禁。</p></div>
      <button type="button" data-testid="start-book-run" :disabled="loading || Boolean(run)" @click="emit('start')">启动工作流</button>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="!run" class="empty">尚未启动书籍工作流。</p>
    <div v-else class="run-summary">
      <strong>{{ statusLabel(run.status) }}</strong>
      <span>{{ run.bookRunId }} · {{ autonomyLevelLabel(run.autonomyLevel) }} · {{ run.progress.completedWorkItems }}/{{ run.progress.totalWorkItems }}</span>
      <span>当前门禁：{{ gateLabel(run.currentGate) }}</span>
      <button v-if="['ready', 'queued', 'running', 'gate_required'].includes(run.status)" type="button" data-testid="advance-book-run" :disabled="loading" @click="emit('advance')">推进工作流</button>
      <div v-if="run.status === 'scope_complete'" class="audit-form">
        <label for="completion-source-fingerprint">完成审计来源指纹</label>
        <input id="completion-source-fingerprint" data-testid="completion-source-fingerprint" v-model="sourceFingerprint" placeholder="输入已验证的完成审计来源指纹" />
        <button type="button" data-testid="run-completion-audit" :disabled="loading || !sourceFingerprint.trim()" @click="emit('completion-audit', sourceFingerprint.trim())">执行完成审计</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { BookRun } from "@/types/novel";
import { ref } from "vue";
import { autonomyLevelLabel, gateLabel, statusLabel } from "@/utils/novelLabels";
withDefaults(defineProps<{ run?: BookRun | null; loading?: boolean; error?: string }>(), { run: null, loading: false, error: "" });
const emit = defineEmits<{ start: []; advance: []; "completion-audit": [sourceFingerprint: string] }>();
const sourceFingerprint = ref("");
</script>

<style scoped>
.book-run-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }.panel-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }.panel-header h2 { margin: 4px 0; }.panel-header p:not(.eyebrow), .empty { margin: 0; color: var(--el-text-color-secondary); }.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }.panel-header button, .run-summary button { border: 1px solid var(--el-border-color); border-radius: 7px; padding: 7px 10px; background: var(--el-color-primary); color: white; cursor: pointer; }.panel-header button:disabled, .run-summary button:disabled { opacity: .55; cursor: not-allowed; }.run-summary { display: grid; gap: 6px; padding: 12px; border-left: 3px solid var(--el-color-primary); background: var(--el-fill-color-lighter); }.run-summary span { color: var(--el-text-color-secondary); font-size: 13px; }.run-summary button { justify-self: start; }.audit-form { display: grid; gap: 6px; padding-top: 8px; border-top: 1px solid var(--el-border-color); }.audit-form label { color: var(--el-text-color-secondary); font-size: 13px; }.audit-form input { padding: 7px 9px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); }.error { color: var(--el-color-danger); }
</style>
