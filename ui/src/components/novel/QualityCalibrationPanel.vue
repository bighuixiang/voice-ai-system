<template>
  <section class="calibration-panel" data-testid="quality-calibration-panel" aria-labelledby="quality-calibration-title">
    <header><div><p class="eyebrow">发布校准证据</p><h2 id="quality-calibration-title">外部校准证据</h2><p>只接收人工或服务商提供的密封留出集证明；平台不生成或展示留出集标签。</p></div><button type="button" :disabled="loading" @click="emit('refresh')">{{ loading ? "读取中…" : "刷新" }}</button></header>
    <div v-if="evidence" class="evidence" data-testid="calibration-evidence"><strong>{{ evidence.status === "calibrated" ? "已校准" : "阻断" }} · {{ reviewerKindLabel(evidence.sourceKind) }}</strong><p>评审器 {{ evidence.evaluatorVersion }} · 留出集 {{ evidence.inputFingerprint }}</p><p>准确率 {{ evidence.accuracy }} / 门槛 {{ evidence.minimumAccuracy }} · {{ evidence.labelAccess === "sealed-separate-from-evaluator-input" ? "标签与评审输入隔离" : "标签边界异常" }}</p><p>证明 {{ evidence.attestation.reference }}</p></div>
    <div v-else class="empty">尚无外部校准证据；提交前需取得独立人工或服务商证明。</div>
    <form class="submission" @submit.prevent="submit">
      <label>来源<select v-model="sourceKind"><option value="human">人工</option><option value="provider">服务商</option></select></label>
      <label>评审器版本<input data-testid="calibration-evaluator" v-model="evaluatorVersion" required /></label>
      <label>密封留出集指纹<input data-testid="calibration-holdout" v-model="holdoutInputFingerprint" required /></label>
      <label>评估数<input data-testid="calibration-evaluated" v-model.number="evaluatedCount" type="number" min="1" required /></label>
      <label>正确数<input data-testid="calibration-correct" v-model.number="correctCount" type="number" min="0" required /></label>
      <label>最低准确率<input v-model.number="minimumAccuracy" type="number" min="0" max="1" step="0.01" required /></label>
      <label>外部证明引用<input data-testid="calibration-attestation" v-model="attestationReference" placeholder="服务商://… 或 人工://…" required /></label>
      <label>审计引用<input data-testid="calibration-evidence-ref" v-model="evidenceReference" placeholder="audit://…" required /></label>
      <button data-testid="submit-calibration" type="submit" :disabled="loading || !canSubmit">提交外部证据</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { QualityCalibrationEvidence } from "@/types/novel";
import { reviewerKindLabel } from "@/utils/novelLabels";

withDefaults(defineProps<{ evidence?: QualityCalibrationEvidence | null; history?: QualityCalibrationEvidence[]; loading?: boolean; error?: string }>(), { evidence: null, history: () => [], loading: false, error: "" });
const emit = defineEmits<{ refresh: []; submit: [input: { evaluatorVersion: string; sourceKind: "provider" | "human"; holdoutInputFingerprint: string; evaluatedCount: number; correctCount: number; accuracy: number; minimumAccuracy: number; attestation: { kind: "provider-signed" | "human-reviewed"; reference: string }; evidenceRefs: string[] }] }>();
const sourceKind = ref<"provider" | "human">("human");
const evaluatorVersion = ref("");
const holdoutInputFingerprint = ref("");
const evaluatedCount = ref(0);
const correctCount = ref(0);
const minimumAccuracy = ref(0.8);
const attestationReference = ref("");
const evidenceReference = ref("");
const canSubmit = computed(() => Boolean(evaluatorVersion.value.trim() && holdoutInputFingerprint.value.trim() && evaluatedCount.value > 0 && correctCount.value >= 0 && correctCount.value <= evaluatedCount.value && attestationReference.value.trim() && evidenceReference.value.trim()));
function submit() {
  if (!canSubmit.value) return;
  emit("submit", { evaluatorVersion: evaluatorVersion.value.trim(), sourceKind: sourceKind.value, holdoutInputFingerprint: holdoutInputFingerprint.value.trim(), evaluatedCount: evaluatedCount.value, correctCount: correctCount.value, accuracy: correctCount.value / evaluatedCount.value, minimumAccuracy: minimumAccuracy.value, attestation: { kind: sourceKind.value === "provider" ? "provider-signed" : "human-reviewed", reference: attestationReference.value.trim() }, evidenceRefs: [evidenceReference.value.trim()] });
}
</script>

<style scoped>
.calibration-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }.calibration-panel header { display: flex; justify-content: space-between; gap: 16px; }.calibration-panel h2 { margin: 4px 0; }.calibration-panel header p:not(.eyebrow), .empty, .evidence p { margin: 0; color: var(--el-text-color-secondary); }.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }.evidence { display: grid; gap: 4px; padding: 12px; border-left: 3px solid var(--el-color-success); background: var(--el-bg-color); }.submission { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.submission label { display: grid; gap: 4px; color: var(--el-text-color-secondary); font-size: 13px; }.submission input, .submission select { padding: 7px 8px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); }.submission button { grid-column: 1 / -1; justify-self: start; padding: 7px 12px; border: 1px solid var(--el-color-primary); border-radius: 7px; color: var(--el-color-primary); background: transparent; }.submission button:disabled { opacity: .5; }.error { color: var(--el-color-danger); }
</style>
