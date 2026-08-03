<template>
  <section class="prose-candidate-panel" data-testid="prose-candidate-panel" aria-labelledby="prose-candidate-title">
    <header class="panel-header">
      <div>
        <p class="eyebrow">RP5 prose review</p>
        <h2 id="prose-candidate-title">正文候选</h2>
        <p>候选正文、不变 canon 和采纳事务分开显示。</p>
      </div>
      <button type="button" aria-label="刷新正文候选" :disabled="loading" @click="emit('refresh')">{{ loading ? "刷新中…" : "刷新" }}</button>
    </header>
    <p v-if="!candidates.length" class="empty">暂无正文候选。</p>
    <article v-for="candidate in candidates" :key="candidate.candidateId" class="candidate-card">
      <div class="heading">
        <div><h3>{{ candidate.chapterId }}</h3><p>候选正文，不是 canon · {{ candidate.status }}</p></div>
        <span>canonWritten: false</span>
      </div>
      <p v-if="candidate.policyVersion && candidate.riskTier" data-testid="candidate-policy">policy {{ candidate.policyVersion }} · risk {{ candidate.riskTier }}</p>
      <p class="content">{{ candidate.content }}</p>
      <div class="actions">
        <button type="button" :aria-label="`验证 ${candidate.candidateId}`" :disabled="busyId === candidate.candidateId" @click="emit('validate', candidate)">验证</button>
        <button type="button" :aria-label="`红蓝审阅 ${candidate.candidateId}`" :disabled="busyId === candidate.candidateId" @click="emit('review', candidate)">红蓝审阅</button>
        <button v-if="reviews[candidate.candidateId]?.verdict === 'blocks-adoption'" type="button" :data-testid="`repair-${candidate.candidateId}`" :disabled="busyId === candidate.candidateId" @click="emit('repair', candidate)">生成局部修复计划</button>
        <button type="button" :aria-label="`读取采纳门禁 ${candidate.candidateId}`" :disabled="busyId === candidate.candidateId" @click="emit('readiness', candidate)">读取采纳门禁</button>
      </div>
      <div v-if="readiness[candidate.candidateId]" class="evidence adoption-readiness">
        <strong>采纳前置：必须作者授权</strong>
        <p>基线 {{ readiness[candidate.candidateId].expectedCanonSha256 }} · {{ readiness[candidate.candidateId].targetPath }}</p>
        <p v-if="adoptions[candidate.candidateId]">采纳绑定红蓝结论：{{ adoptions[candidate.candidateId].reviewVerdict }}</p>
        <label :for="`authorization-${candidate.candidateId}`">授权 ID</label>
        <input :id="`authorization-${candidate.candidateId}`" :data-testid="`authorization-${candidate.candidateId}`" :value="authorizationIds[candidate.candidateId] || ''" placeholder="输入作者授权 ID" @input="onAuthorizationInput(candidate.candidateId, $event)" />
        <div class="actions">
          <button type="button" :data-testid="`adopt-${candidate.candidateId}`" :disabled="busyId === candidate.candidateId || !authorizationIds[candidate.candidateId] || readiness[candidate.candidateId].validationStatus !== 'passed'" @click="emit('adopt', candidate, { expectedCanonSha256: readiness[candidate.candidateId].expectedCanonSha256, authorizationId: authorizationIds[candidate.candidateId] })">作者授权并采纳</button>
          <button v-if="adoptions[candidate.candidateId]?.status === 'committed'" type="button" :data-testid="`settle-${candidate.candidateId}`" :disabled="busyId === candidate.candidateId" @click="emit('settle', candidate, adoptions[candidate.candidateId]!)">结算章节</button>
        </div>
      </div>
      <div v-if="validations[candidate.candidateId]" class="evidence"><strong>验证{{ validations[candidate.candidateId].status === 'passed' ? '通过' : '阻断' }}</strong><ul><li v-for="check in validations[candidate.candidateId].checks" :key="check.checkId">{{ check.checkId }}: {{ check.status }} · {{ check.detail }}</li></ul></div>
      <div v-if="reviews[candidate.candidateId]" class="evidence"><strong>红蓝审阅：{{ reviews[candidate.candidateId].status }} / {{ reviews[candidate.candidateId].verdict }}</strong><p>建议：{{ reviews[candidate.candidateId].recommendation }}；共同前提 {{ reviews[candidate.candidateId].commonGround.length }} 条</p><ul><li v-for="strength in reviews[candidate.candidateId].blueStrengths" :key="strength.strengthId">蓝方：{{ strength.detail }}</li><li v-for="finding in reviews[candidate.candidateId].redFindings" :key="finding.findingId">红方：{{ finding.detail }}</li><li v-for="falsifier in reviews[candidate.candidateId].redArgument.falsifiers" :key="falsifier">可证伪：{{ falsifier }}</li></ul></div>
      <div v-if="repairPlans[candidate.candidateId]" class="evidence repair-plan"><strong>局部修复计划：{{ repairPlans[candidate.candidateId].status }}</strong><p>目标问题 {{ repairPlans[candidate.candidateId].targetFindings.length }} 个；最多修改 {{ repairPlans[candidate.candidateId].scope.maxChangedParagraphs }} 段。</p><small>禁止：{{ repairPlans[candidate.candidateId].prohibitedActions.join("、") }}</small><textarea :data-testid="`repair-content-${candidate.candidateId}`" :value="repairContents[candidate.candidateId] || candidate.content" @input="onRepairInput(candidate.candidateId, $event)" /><button type="button" :data-testid="`create-repair-candidate-${candidate.candidateId}`" :disabled="busyId === candidate.candidateId" @click="emit('create-repair-candidate', candidate, repairContents[candidate.candidateId] || candidate.content)">生成非 canon 修复候选</button><button v-if="repairCandidates[candidate.candidateId]" type="button" :data-testid="`evaluate-repair-${candidate.candidateId}`" :disabled="busyId === candidate.candidateId" @click="emit('evaluate-repair', candidate)">重新验证修复回归</button><p v-if="repairRegressions[candidate.candidateId]">修复回归：{{ repairRegressions[candidate.candidateId].status }}；改善 {{ repairRegressions[candidate.candidateId].improvements.length }} 项；回归 {{ repairRegressions[candidate.candidateId].regressions.length }} 项。</p></div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { reactive } from "vue";
import type { ProseAdoptionReadiness, ProseAdoptionTransaction, ProseCandidate, ProseValidationBundle, RedBlueReview, ProseRepairPlan, ProseRepairCandidate, ProseRepairRegression } from "@/types/novel";

withDefaults(defineProps<{ candidates: ProseCandidate[]; validations?: Record<string, ProseValidationBundle>; reviews?: Record<string, RedBlueReview>; repairPlans?: Record<string, ProseRepairPlan>; repairCandidates?: Record<string, ProseRepairCandidate>; repairRegressions?: Record<string, ProseRepairRegression>; readiness?: Record<string, ProseAdoptionReadiness>; adoptions?: Record<string, ProseAdoptionTransaction>; loading?: boolean; busyId?: string }>(), { validations: () => ({}), reviews: () => ({}), repairPlans: () => ({}), repairCandidates: () => ({}), repairRegressions: () => ({}), readiness: () => ({}), adoptions: () => ({}), loading: false, busyId: "" });
const emit = defineEmits<{
  refresh: [];
  validate: [candidate: ProseCandidate];
  review: [candidate: ProseCandidate];
  repair: [candidate: ProseCandidate];
  'create-repair-candidate': [candidate: ProseCandidate, content: string];
  'evaluate-repair': [candidate: ProseCandidate];
  readiness: [candidate: ProseCandidate];
  adopt: [candidate: ProseCandidate, input: { expectedCanonSha256: string; authorizationId: string }];
  settle: [candidate: ProseCandidate, transaction: ProseAdoptionTransaction];
}>();
const authorizationIds = reactive<Record<string, string>>({});
const repairContents = reactive<Record<string, string>>({});
function setAuthorization(candidateId: string, authorizationId: string) { authorizationIds[candidateId] = authorizationId; }
function onAuthorizationInput(candidateId: string, event: Event) { setAuthorization(candidateId, (event.target as HTMLInputElement).value); }
function onRepairInput(candidateId: string, event: Event) { repairContents[candidateId] = (event.target as HTMLTextAreaElement).value; }
</script>

<style scoped>
.prose-candidate-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }
.panel-header, .heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.panel-header h2, .heading h3 { margin: 4px 0; }.panel-header p:not(.eyebrow), .heading p, .empty { margin: 0; color: var(--el-text-color-secondary); }.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.panel-header button, .actions button { border: 1px solid var(--el-border-color); border-radius: 7px; padding: 6px 10px; background: transparent; color: var(--el-text-color-primary); cursor: pointer; }.panel-header button:disabled, .actions button:disabled { cursor: not-allowed; opacity: .55; }
.candidate-card { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--el-color-warning); border-radius: 10px; background: var(--el-fill-color-lighter); }.content { margin: 0; white-space: pre-wrap; max-height: 220px; overflow: auto; }.actions { display: flex; gap: 8px; flex-wrap: wrap; }.evidence { padding: 10px; border-left: 3px solid var(--el-color-success); background: var(--el-bg-color); }.evidence ul { margin: 4px 0 0; padding-left: 20px; }.evidence li, .evidence p { color: var(--el-text-color-secondary); font-size: 13px; }.adoption-readiness { border-left-color: var(--el-color-primary); display: grid; gap: 6px; }.adoption-readiness input { max-width: 320px; padding: 6px 8px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); }
</style>
