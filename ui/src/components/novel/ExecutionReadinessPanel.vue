<template>
  <section class="execution-readiness-panel" data-testid="execution-readiness-panel" aria-labelledby="execution-readiness-title">
    <header class="panel-header"><div><p class="eyebrow">RP4 execution gate</p><h2 id="execution-readiness-title">执行就绪证明</h2><p>证明、版本指针和章节窗口必须同时通过；大纲提交本身不等于可执行。</p></div><button type="button" aria-label="刷新执行证明" :disabled="loading" @click="emit('refresh-proof')">{{ loading ? "刷新中…" : "刷新证明" }}</button></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="proof" class="proof-summary"><strong>证明 {{ proof.status }}</strong><span>executionReady: {{ String(proof.executionReady) }} · version: {{ proof.versionId }}</span><ul><li v-for="check in proof.checks" :key="check.checkId">{{ check.checkId }}: {{ check.status }} — {{ check.detail }}</li></ul></div>
    <p v-else class="empty">尚无执行就绪证明。</p>
    <div class="chapter-gate"><div><strong>目标章节：{{ chapterId || "未选择" }}</strong><p v-if="readiness">{{ readiness.allowed ? "允许执行" : `阻断：${readiness.reason || "未通过门禁"}` }}</p><p v-else>尚未检查章节执行门禁。</p></div><div class="gate-actions"><button type="button" :aria-label="`检查 ${chapterId} 执行门禁`" :disabled="loading || !chapterId" @click="emit('check-readiness', chapterId)">检查章节门禁</button><button v-if="readiness?.allowed && chapterId" type="button" data-testid="start-chapter-production" :disabled="loading" @click="emit('start-production', chapterId)">开始本章生产</button></div></div>
    <ul v-if="readiness" class="readiness-checks"><li v-for="check in readiness.checks" :key="check.checkId">{{ check.checkId }}: {{ check.status }} — {{ check.detail }}</li></ul>
    <div class="work-items"><strong>执行工作项</strong><p v-if="!workItems.length">暂无已排队工作项。</p><ul v-else><li v-for="item in workItems" :key="item.workItemId">{{ item.chapterId }} · {{ item.status }}<span v-if="item.blockedReason"> · {{ item.blockedReason }}</span></li></ul></div>
  </section>
</template>

<script setup lang="ts">
import type { ExecutionReadinessDecision, ExecutionReadyProof, ExecutionWorkItem } from "@/types/novel";
withDefaults(defineProps<{ proof: ExecutionReadyProof | null; readiness: ExecutionReadinessDecision | null; workItems?: ExecutionWorkItem[]; chapterId?: string; loading?: boolean; error?: string }>(), { workItems: () => [], chapterId: "", loading: false, error: "" });
const emit = defineEmits<{ "refresh-proof": []; "check-readiness": [chapterId: string]; "start-production": [chapterId: string] }>();
</script>

<style scoped>
.execution-readiness-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }.panel-header, .chapter-gate { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }.gate-actions { display: flex; gap: 8px; flex-wrap: wrap; }.panel-header h2 { margin: 4px 0; }.panel-header p:not(.eyebrow), .chapter-gate p, .empty { margin: 0; color: var(--el-text-color-secondary); }.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }.panel-header button, .chapter-gate button { border: 1px solid var(--el-border-color); border-radius: 7px; padding: 7px 10px; background: transparent; color: var(--el-text-color-primary); cursor: pointer; }.gate-actions button:last-child { background: var(--el-color-primary); color: white; }.proof-summary { display: grid; gap: 6px; padding: 12px; border-left: 3px solid var(--el-color-success); background: var(--el-fill-color-lighter); }.proof-summary span, .proof-summary li, .readiness-checks li { color: var(--el-text-color-secondary); font-size: 13px; }.proof-summary ul, .readiness-checks { margin: 0; padding-left: 20px; }.chapter-gate { padding-top: 10px; border-top: 1px solid var(--el-border-color); }.chapter-gate p { margin-top: 4px; color: var(--el-color-success); }.error { color: var(--el-color-danger); }
.work-items { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--el-border-color); }.work-items p, .work-items li { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }.work-items ul { margin: 0; padding-left: 20px; }
</style>
