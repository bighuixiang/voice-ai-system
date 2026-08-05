<template>
  <section class="review-panel" data-testid="independent-review-panel" aria-labelledby="independent-review-title">
    <header><div><p class="eyebrow">独立评审门禁</p><h2 id="independent-review-title">独立评审证据</h2><p>仅接受外部人工或服务商评审；评审通过也不会写入正式设定。</p></div><button type="button" :disabled="loading" @click="emit('refresh')">{{ loading ? "读取中…" : "刷新" }}</button></header>
    <div v-if="review" class="evidence"><strong>{{ statusLabel(review.status) }} · {{ reviewerKindLabel(review.reviewer.kind) }}</strong><p>评审者 {{ review.reviewer.id }} · {{ review.reviewer.kind === "independent-deterministic" ? "本地确定性" : review.reviewer.attestationReference }}</p><p>理解快照 {{ review.snapshotFingerprint }}</p><p>已写入正式设定：{{ booleanLabel(review.canonWritten) }}</p><ul><li v-for="check in review.checks" :key="check.checkId">{{ checkIdLabel(check.checkId) }}：{{ statusLabel(check.status) }} · {{ check.detail }}</li></ul></div>
    <div v-else class="empty">尚无独立评审证据。</div>
    <form class="submission" @submit.prevent="submit">
      <label>评审者类型<select v-model="reviewerKind"><option value="human">人工</option><option value="provider">服务商</option></select></label>
      <label>评审者标识<input data-testid="reviewer-id" v-model="reviewerId" required /></label>
      <label>外部证明引用<input data-testid="review-attestation" v-model="attestationReference" required /></label>
      <label>理解快照指纹<input data-testid="review-snapshot" v-model="snapshotFingerprint" minlength="64" required /></label>
      <label>审计引用<input data-testid="review-evidence" v-model="evidenceReference" required /></label>
      <label v-for="check in requiredChecks" :key="check">{{ check }}<input :data-testid="`review-check-${check}`" v-model="checkDetails[check]" required /></label>
      <button type="submit" :disabled="loading || !canSubmit">提交外部评审</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { UnderstandingReview } from "@/types/novel";
import { booleanLabel, checkIdLabel, reviewerKindLabel, statusLabel } from "@/utils/novelLabels";
type ReviewerKind = "human" | "provider";
const requiredChecks = ["source-fingerprint", "evidence-spans", "branch-separation", "question-gate", "canon-isolation"] as const;
withDefaults(defineProps<{ review?: UnderstandingReview | null; loading?: boolean }>(), { review: null, loading: false });
const emit = defineEmits<{ refresh: []; submit: [input: { reviewerKind: ReviewerKind; reviewerId: string; attestationReference: string; snapshotFingerprint: string; checks: Array<{ checkId: typeof requiredChecks[number]; detail: string }>; evidenceRefs: string[] }] }>();
const reviewerKind = ref<ReviewerKind>("human");
const reviewerId = ref("");
const attestationReference = ref("");
const snapshotFingerprint = ref("");
const evidenceReference = ref("");
const checkDetails = reactive<Record<string, string>>({});
const canSubmit = computed(() => Boolean(reviewerId.value.trim() && attestationReference.value.trim() && /^[a-f0-9]{64}$/i.test(snapshotFingerprint.value.trim()) && evidenceReference.value.trim() && requiredChecks.every((check) => checkDetails[check]?.trim())));
function submit() { if (!canSubmit.value) return; emit("submit", { reviewerKind: reviewerKind.value, reviewerId: reviewerId.value.trim(), attestationReference: attestationReference.value.trim(), snapshotFingerprint: snapshotFingerprint.value.trim(), checks: requiredChecks.map((check) => ({ checkId: check, detail: checkDetails[check].trim() })), evidenceRefs: [evidenceReference.value.trim()] }); }
</script>

<style scoped>
.review-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }.review-panel header { display: flex; justify-content: space-between; gap: 16px; }.review-panel h2 { margin: 4px 0; }.review-panel header p:not(.eyebrow), .empty, .evidence p { margin: 0; color: var(--el-text-color-secondary); }.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }.evidence { display: grid; gap: 5px; padding: 12px; border-left: 3px solid var(--el-color-success); background: var(--el-bg-color); }.evidence ul { margin: 4px 0 0; padding-left: 18px; }.submission { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }.submission label { display: grid; gap: 4px; color: var(--el-text-color-secondary); font-size: 13px; }.submission input, .submission select { padding: 6px 8px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); }.submission button { grid-column: 1 / -1; justify-self: start; padding: 7px 11px; border: 1px solid var(--el-color-primary); border-radius: 7px; background: transparent; color: var(--el-color-primary); }
</style>
