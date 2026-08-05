<template>
  <section class="contract-candidate-panel" data-testid="contract-candidate-panel" aria-labelledby="contract-candidate-title">
    <header class="panel-header">
      <div>
        <p class="eyebrow">故事设定评审</p>
        <h2 id="contract-candidate-title">故事契约候选</h2>
        <p>候选可比较、可追溯；在作者采纳前不会写入正式设定。</p>
      </div>
      <button type="button" aria-label="刷新故事契约候选" :disabled="loading" @click="emit('refresh')">
        {{ loading ? "刷新中…" : "刷新" }}
      </button>
    </header>

    <p v-if="error" class="panel-error" role="alert">{{ error }}</p>
    <p v-else-if="!candidates.length" class="panel-empty">暂无故事契约候选。完成一次理解决策后，候选会出现在这里。</p>
    <div v-else class="candidate-list">
      <article v-for="candidate in candidates" :key="candidate.candidateId" class="candidate-card" :class="{ stale: candidate.status === 'stale' }">
        <div class="candidate-heading">
          <div>
            <h3>{{ candidate.variant?.label || candidate.candidateId }}</h3>
            <p class="candidate-meta">{{ candidate.status === "candidate" ? "候选，尚未成为正式设定" : "已过期候选，尚未成为正式设定" }}</p>
          </div>
          <button type="button" :aria-label="`查看候选 ${candidate.candidateId}`" @click="selectCandidate(candidate)">查看</button>
        </div>
        <p v-if="candidate.variant?.summary" class="candidate-summary">{{ candidate.variant.summary }}</p>
        <dl class="candidate-fields">
          <template v-for="field in candidate.fields" :key="field.fieldId">
            <dt>{{ field.path }}</dt>
            <dd>{{ field.value }} <small>· {{ epistemicStatusLabel(field.epistemicStatus) }} · {{ field.evidenceRefs.map((ref) => ref.refId).join(", ") || "无证据" }}</small></dd>
          </template>
        </dl>
        <div v-if="candidate.unknowns.length" class="candidate-section">
          <strong>仍未知</strong>
          <ul><li v-for="unknown in candidate.unknowns" :key="unknown">{{ unknown }}</li></ul>
        </div>
        <div v-if="candidate.assumptions.length" class="candidate-section">
          <strong>暂定假设</strong>
          <ul><li v-for="assumption in candidate.assumptions" :key="assumption">{{ assumption }}</li></ul>
        </div>
        <p class="candidate-integrity">已写入正式设定：{{ booleanLabel(candidate.canonWritten) }} · 指纹：{{ candidate.fingerprint.slice(0, 12) }}…</p>
        <button v-if="candidate.status === 'candidate' && candidate.candidateId === outlineSourceCandidateId" type="button" class="outline-button" :aria-label="`生成大纲候选 ${candidate.candidateId}`" :disabled="outlineLoading" @click="emit('compile-outline', { sourceCandidateId: candidate.candidateId })">{{ outlineLoading ? "正在同步蓝图" : "生成大纲候选" }}</button>
        <p v-else-if="candidate.status === 'candidate'" class="outline-guide">{{ outlineSourceCandidateId ? "此设定不是已确认蓝图的来源，请按蓝图对应设定继续。" : "请先确认上方故事蓝图，再开始制定大纲。" }}</p>
      </article>
    </div>
    <section v-if="selectedCandidate" class="adoption-review" aria-label="逐项采纳审阅">
      <h3>逐项采纳：{{ selectedCandidate.candidateId }}</h3>
      <p>每个字段都必须有明确结果；生成提案不会直接写入正式设定。</p>
      <label v-for="field in selectedCandidate.fields" :key="field.fieldId" class="decision-row">
        <span>{{ field.path }}</span>
        <select :aria-label="`决定 ${field.path}`" v-model="fieldDecisions[field.fieldId]">
          <option value="accept">采纳</option>
          <option value="keep-provisional">保留为暂定</option>
          <option value="reject">拒绝</option>
          <option value="delegate">委托系统推荐</option>
        </select>
      </label>
      <button type="button" :aria-label="`生成采纳提案 ${selectedCandidate.candidateId}`" :disabled="adoptionLoading" @click="submitAdoption">
        {{ adoptionLoading ? "生成中…" : "生成采纳提案" }}
      </button>
      <p v-if="adoptionError" class="panel-error" role="alert">{{ adoptionError }}</p>
    </section>
    <section v-if="proposal" class="proposal-status" aria-label="采纳提案状态">
      <strong>提案状态：{{ statusLabel(proposal.status) }}</strong>
      <span>已写入正式设定：{{ booleanLabel(proposal.canonWritten) }}</span>
      <p v-if="proposal.status === 'ready_for_authorization'">提交前需要作者明确填写授权人和授权编号。</p>
      <div v-if="proposal.status === 'ready_for_authorization'" class="authorization-form">
        <label>授权人<input aria-label="授权人" v-model="actorId" /></label>
        <label>授权编号<input aria-label="授权编号" v-model="authorizationId" /></label>
        <button type="button" aria-label="提交正式设定采纳" :disabled="adoptionLoading || !actorId.trim() || !authorizationId.trim()" @click="submitCommit">
          {{ adoptionLoading ? "提交中…" : "提交正式设定采纳" }}
        </button>
      </div>
      <p v-else-if="proposal.status === 'committed'" class="next-step">故事设定已采纳。下一步：回到大纲候选，选择并验证章节结构。</p>
      <p v-if="adoptionError" class="panel-error" role="alert">{{ adoptionError }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ContractAdoptionProposal, StoryContractCandidate } from "@/types/novel";
import { booleanLabel, epistemicStatusLabel, statusLabel } from "@/utils/novelLabels";

const props = withDefaults(defineProps<{ candidates: StoryContractCandidate[]; outlineSourceCandidateId?: string; outlineLoading?: boolean; loading?: boolean; error?: string; adoptionLoading?: boolean; adoptionError?: string; proposal?: ContractAdoptionProposal | null }>(), { outlineSourceCandidateId: "", outlineLoading: false, loading: false, error: "", adoptionLoading: false, adoptionError: "", proposal: null });
const emit = defineEmits<{
  refresh: [];
  select: [candidate: StoryContractCandidate];
  adopt: [input: { candidateId: string; expectedCandidateFingerprint: string; fieldDecisions: Array<{ fieldId: string; status: "accept" | "keep-provisional" | "reject" | "delegate" }> }];
  commit: [input: { expectedProposalFingerprint: string; actorId: string; authorizationId: string }];
  "compile-outline": [input: { sourceCandidateId: string }];
}>();
const selectedCandidateId = ref("");
const fieldDecisions = ref<Record<string, "accept" | "keep-provisional" | "reject" | "delegate">>({});
const actorId = ref("");
const authorizationId = ref("");
const selectedCandidate = computed(() => props.candidates.find((candidate) => candidate.candidateId === selectedCandidateId.value) || null);

function selectCandidate(candidate: StoryContractCandidate) {
  selectedCandidateId.value = candidate.candidateId;
  fieldDecisions.value = Object.fromEntries(candidate.fields.map((field) => [field.fieldId, "keep-provisional"]));
  emit("select", candidate);
}

function submitAdoption() {
  if (!selectedCandidate.value) return;
  emit("adopt", {
    candidateId: selectedCandidate.value.candidateId,
    expectedCandidateFingerprint: selectedCandidate.value.fingerprint,
    fieldDecisions: selectedCandidate.value.fields.map((field) => ({ fieldId: field.fieldId, status: fieldDecisions.value[field.fieldId] || "keep-provisional" }))
  });
}

function submitCommit() {
  if (!props.proposal || !actorId.value.trim() || !authorizationId.value.trim()) return;
  emit("commit", { expectedProposalFingerprint: props.proposal.fingerprint, actorId: actorId.value.trim(), authorizationId: authorizationId.value.trim() });
}
</script>

<style scoped>
.contract-candidate-panel { display: grid; gap: 14px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }
.panel-header, .candidate-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.panel-header h2, .candidate-heading h3 { margin: 4px 0; }
.panel-header p:not(.eyebrow), .candidate-summary, .panel-empty, .candidate-meta, .candidate-integrity { margin: 0; color: var(--el-text-color-secondary); }
.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.panel-header button, .candidate-heading button { border: 1px solid var(--el-border-color); border-radius: 7px; padding: 6px 10px; background: transparent; color: var(--el-text-color-primary); cursor: pointer; }
.panel-header button:disabled { opacity: .55; cursor: not-allowed; }
.candidate-list { display: grid; gap: 12px; }
.candidate-card { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--el-color-warning); border-radius: 10px; background: var(--el-fill-color-lighter); }
.candidate-card.stale { border-color: var(--el-border-color); opacity: .78; }
.candidate-meta { color: var(--el-color-warning-dark-2); font-size: 12px; font-weight: 700; }
.candidate-fields { display: grid; grid-template-columns: minmax(150px, .35fr) 1fr; gap: 6px 12px; margin: 0; }
.candidate-fields dt { color: var(--el-text-color-secondary); font-size: 12px; }
.candidate-fields dd { margin: 0; }
.candidate-fields small { color: var(--el-text-color-secondary); }
.candidate-section { font-size: 13px; }
.candidate-section ul { margin: 4px 0 0; padding-left: 20px; }
.candidate-integrity { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.outline-button { justify-self: start; padding: 7px 10px; border: 0; border-radius: 7px; background: var(--el-color-primary); color: white; cursor: pointer; }
.outline-button:disabled { opacity: .55; cursor: not-allowed; }
.outline-guide { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }
.panel-error { color: var(--el-color-danger); }
.adoption-review { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--el-color-primary); border-radius: 10px; }
.adoption-review h3, .adoption-review p { margin: 0; }
.adoption-review p { color: var(--el-text-color-secondary); font-size: 13px; }
.decision-row { display: grid; grid-template-columns: 1fr minmax(150px, 220px); gap: 12px; align-items: center; }
.decision-row select { padding: 6px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); }
.adoption-review > button { justify-self: start; padding: 8px 12px; border: 0; border-radius: 7px; background: var(--el-color-primary); color: white; cursor: pointer; }
.adoption-review > button:disabled { opacity: .55; cursor: not-allowed; }
.proposal-status { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--el-color-success); border-radius: 10px; }
.proposal-status span, .proposal-status p { color: var(--el-text-color-secondary); font-size: 13px; }
.proposal-status p { margin: 0; }
.authorization-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
.authorization-form label { display: grid; gap: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.authorization-form input { padding: 7px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); }
.authorization-form button { padding: 8px 12px; border: 0; border-radius: 7px; background: var(--el-color-success); color: white; cursor: pointer; }
.authorization-form button:disabled { opacity: .55; cursor: not-allowed; }
</style>
