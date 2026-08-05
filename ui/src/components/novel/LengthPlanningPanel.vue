<template>
  <section class="length-panel" data-testid="length-planning-panel">
    <header><div><p class="eyebrow">篇幅控制</p><h2>篇幅契约与预测</h2></div><button type="button" :disabled="loading" @click="emit('refresh')">{{ loading ? "读取中…" : "刷新" }}</button></header>
    <div v-if="contract" class="contract"><strong>软预算 / 硬锁：{{ contract.hardLocks.length || "无" }}</strong><code>基线：{{ contract.fingerprint }}</code><span>暂停线 {{ contract.pauseThresholdRatio * 100 }}%</span></div>
    <div v-else class="empty">尚未建立篇幅契约。</div>
    <div v-if="forecast" class="forecast" :class="forecast.status"><strong>{{ lengthLabel(forecast.status) }}</strong><span>实际 {{ forecast.actuals.totalWords }} 字 / {{ forecast.actuals.totalChapters }} 章</span><small v-if="forecast.blockingReasons.length">阻断：{{ forecast.blockingReasons.join("、") }}</small></div>
    <button v-if="forecast?.status === 'pause-required' && !decision" data-testid="record-length-variance" type="button" :disabled="loading" @click="emit('decide')">暂停并记录偏差决策</button>
    <div v-if="decision" class="decision"><strong>{{ lengthLabel(decision.status) }}</strong><span>选择：{{ lengthLabel(decision.choice) }}</span></div>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import type { LengthContract, LengthForecast, LengthVarianceDecision } from "@/types/novel";
import { lengthLabel } from "@/utils/novelLabels";
withDefaults(defineProps<{ contract?: LengthContract | null; forecast?: LengthForecast | null; decision?: LengthVarianceDecision | null; loading?: boolean; error?: string }>(), { contract: null, forecast: null, decision: null, loading: false, error: "" });
const emit = defineEmits<{ refresh: []; decide: [] }>();
</script>
<style scoped>
.length-panel{display:grid;gap:12px;padding:18px;border:1px solid var(--el-border-color);border-radius:14px;background:var(--el-bg-color-overlay)}header{display:flex;justify-content:space-between;gap:16px}.eyebrow{margin:0;color:var(--el-color-primary);font-size:12px;text-transform:uppercase}.contract,.forecast,.decision{display:flex;gap:12px;align-items:center;padding:10px;border-radius:8px;background:var(--el-fill-color-lighter)}.forecast.pause-required{background:var(--el-color-warning-light-9);color:var(--el-color-warning)}.forecast small{display:block}.empty,.error{color:var(--el-text-color-secondary)}.error{color:var(--el-color-danger)}button{padding:7px 11px;border:1px solid var(--el-border-color);border-radius:7px;background:transparent;color:var(--el-text-color-primary)}
</style>
