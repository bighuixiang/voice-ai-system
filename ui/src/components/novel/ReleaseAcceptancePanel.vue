<template>
  <section class="release-panel" data-testid="release-acceptance-panel" aria-labelledby="release-acceptance-title">
    <header><div><p class="eyebrow">RP5 release gate</p><h2 id="release-acceptance-title">发布验收证据</h2><p>这是只读权威决策；任一门禁缺失时不得激活。</p></div><button data-testid="refresh-release-acceptance" type="button" :disabled="loading" @click="emit('refresh')">{{ loading ? "评估中…" : "刷新验收" }}</button></header>
    <div v-if="decision" class="decision" :class="decision.status"><strong>{{ decision.status }}</strong><span>评估于 {{ decision.evaluatedAt }}</span><code data-testid="release-acceptance-fingerprint">fingerprint: {{ decision.fingerprint }}</code></div>
    <div v-else class="empty">尚未读取发布验收决策。</div>
    <div v-if="activation" class="activation" data-testid="release-activation">
      <strong>active</strong><span>已激活 {{ activation.activatedAt }}</span><code>fingerprint: {{ activation.fingerprint }}</code>
    </div>
    <div v-else-if="decision?.status === 'accepted'" class="activation-action">
      <button data-testid="activate-release" type="button" :disabled="activating" @click="emit('activate')">{{ activating ? "激活中…" : "激活发布" }}</button>
    </div>
    <p v-if="activationError" class="blocked">{{ activationError }}</p>
    <ul v-if="decision" class="checks"><li v-for="check in decision.checks" :key="check.checkId" :class="check.status"><span>{{ check.checkId }}</span><strong>{{ check.status }}</strong><small>{{ check.reason }}</small><small v-if="check.evidence.length">证据：{{ check.evidence.join(", ") }}</small></li></ul>
    <p v-if="decision?.status === 'do-not-activate'" class="blocked">不得激活：先补齐缺失门禁并重新评估。</p>
  </section>
</template>

<script setup lang="ts">
import type { ReleaseAcceptanceDecision, ReleaseActivation } from "@/types/novel";
const props = withDefaults(defineProps<{
  decision?: ReleaseAcceptanceDecision | null;
  activation?: ReleaseActivation | null;
  loading?: boolean;
  activating?: boolean;
  activationError?: string;
}>(), { decision: null, activation: null, loading: false, activating: false, activationError: "" });
const emit = defineEmits<{ refresh: []; activate: [] }>();
</script>

<style scoped>
.release-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }.release-panel header { display: flex; justify-content: space-between; gap: 16px; }.release-panel h2 { margin: 4px 0; }.release-panel header p:not(.eyebrow), .empty { margin: 0; color: var(--el-text-color-secondary); }.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }.release-panel button { padding: 7px 11px; border: 1px solid var(--el-border-color); border-radius: 7px; background: transparent; color: var(--el-text-color-primary); }.decision { display: flex; justify-content: space-between; padding: 10px; border-radius: 8px; }.decision.accepted { background: var(--el-color-success-light-9); color: var(--el-color-success); }.decision.do-not-activate { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }.activation { display: flex; gap: 12px; align-items: center; padding: 10px; border-radius: 8px; background: var(--el-color-success-light-9); color: var(--el-color-success); }.activation-action { display: flex; justify-content: flex-end; }.checks { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }.checks li { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; padding: 9px 10px; border-left: 3px solid var(--el-border-color); background: var(--el-fill-color-lighter); }.checks li.passed { border-left-color: var(--el-color-success); }.checks li.missing { border-left-color: var(--el-color-danger); }.checks small { grid-column: 1 / -1; color: var(--el-text-color-secondary); }.blocked { margin: 0; color: var(--el-color-danger); font-weight: 600; }
</style>
