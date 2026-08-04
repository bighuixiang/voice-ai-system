<template>
  <section class="outline-candidate-panel" data-testid="outline-candidate-panel" aria-labelledby="outline-candidate-title">
    <header class="panel-header">
      <div><p class="eyebrow">大纲评审</p><h2 id="outline-candidate-title">可执行大纲候选</h2><p>验证只证明候选结构，不能把大纲写入正式设定或宣称可执行。</p></div>
      <button type="button" aria-label="刷新大纲候选" :disabled="loading" @click="emit('refresh')">{{ loading ? "刷新中…" : "刷新" }}</button>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!candidates.length" class="empty">暂无大纲候选。</p>
    <div v-else class="candidate-list">
      <article v-for="outline in candidates" :key="outline.outlineId" class="candidate-card" :class="{ stale: outline.status === 'stale' }">
        <div class="candidate-heading"><div><h3>{{ outline.outlineId }}</h3><p>{{ outline.status === "candidate" ? "候选，尚未成为正式设定" : "已过期候选，尚未成为正式设定" }}</p></div><button type="button" :aria-label="`验证大纲 ${outline.outlineId}`" :disabled="validatingId === outline.outlineId" @click="emit('validate', outline)">{{ validatingId === outline.outlineId ? "验证中…" : "验证" }}</button></div>
        <p>近端冻结 {{ outline.horizon.strongFreezeCount }} / {{ outline.horizon.totalChapterCount }} 章 · 已写入正式设定：{{ String(outline.canonWritten) }}</p>
        <ul class="chapter-list">
          <li v-for="chapter in outline.chapters" :key="chapter.chapterId"><label><input type="checkbox" :aria-label="`选择 ${chapter.chapterId}`" :checked="selectedChapterIds(outline).includes(chapter.chapterId)" @change="toggleChapter(outline, chapter.chapterId, ($event.target as HTMLInputElement).checked)" />{{ chapter.order }}. {{ chapter.title }} <small>{{ chapter.function }} · {{ chapter.freeze }}</small></label></li>
        </ul>
        <div v-if="reports[outline.outlineId]" class="validation-report"><strong>{{ reports[outline.outlineId].status === "passed" ? "验证通过，但尚未执行就绪" : "验证阻断" }}</strong><ul><li v-for="check in reports[outline.outlineId].checks" :key="check.checkId">{{ check.checkId }}: {{ check.status }} — {{ check.detail }}</li></ul></div>
        <button type="button" class="selection-button" :disabled="!selectedChapterIds(outline).length" @click="emit('select-chapters', { outline, chapterIds: selectedChapterIds(outline) })">确认章节选择（{{ selectedChapterIds(outline).length }}）</button>
        <button v-if="!proposal && selectedChapterIds(outline).length" type="button" class="selection-button" aria-label="生成大纲采纳提案" :disabled="adoptionLoading" @click="emit('create-proposal', { outline, chapterIds: selectedChapterIds(outline) })">生成采纳提案</button>
      </article>
    </div>
    <section v-if="proposal" class="proposal-status" aria-label="大纲采纳提案状态">
      <strong>提案状态：{{ proposal.status }}</strong><span>canonWritten: {{ String(proposal.canonWritten) }} · 已选 {{ proposal.selectedChapterIds.length }} 章</span>
      <div v-if="proposal.status === 'ready_for_authorization'" class="authorization-form">
        <label>授权人<input aria-label="授权人" v-model="actorId" /></label><label>授权编号<input aria-label="授权编号" v-model="authorizationId" /></label>
        <button type="button" aria-label="授权大纲采纳" :disabled="adoptionLoading || !actorId.trim() || !authorizationId.trim()" @click="submitAuthorization">授权大纲采纳</button>
      </div>
      <button v-if="proposal.status === 'authorized'" type="button" aria-label="提交大纲执行版本" :disabled="adoptionLoading" @click="emit('commit', proposal.fingerprint)">{{ adoptionLoading ? "提交中…" : "提交大纲执行版本" }}</button>
      <p v-if="adoptionError" class="error" role="alert">{{ adoptionError }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { OutlineAdoptionProposal, OutlineCandidate, OutlineValidationReport } from "@/types/novel";

const props = withDefaults(defineProps<{ candidates: OutlineCandidate[]; reports: Record<string, OutlineValidationReport>; loading?: boolean; validatingId?: string; error?: string; proposal?: OutlineAdoptionProposal | null; adoptionLoading?: boolean; adoptionError?: string }>(), { loading: false, validatingId: "", error: "", proposal: null, adoptionLoading: false, adoptionError: "" });
const emit = defineEmits<{ refresh: []; validate: [outline: OutlineCandidate]; "select-chapters": [payload: { outline: OutlineCandidate; chapterIds: string[] }]; "create-proposal": [payload: { outline: OutlineCandidate; chapterIds: string[] }]; authorize: [payload: { expectedProposalFingerprint: string; actorId: string; authorizationId: string }]; commit: [expectedProposalFingerprint: string] }>();
const selections = ref<Record<string, string[]>>({});
const actorId = ref("");
const authorizationId = ref("");
function selectedChapterIds(outline: OutlineCandidate) { return selections.value[outline.outlineId] || []; }
function toggleChapter(outline: OutlineCandidate, chapterId: string, checked: boolean) {
  const current = new Set(selectedChapterIds(outline));
  checked ? current.add(chapterId) : current.delete(chapterId);
  selections.value = { ...selections.value, [outline.outlineId]: [...current] };
}
function submitAuthorization() {
  if (!props.proposal || !actorId.value.trim() || !authorizationId.value.trim()) return;
  emit("authorize", { expectedProposalFingerprint: props.proposal.fingerprint, actorId: actorId.value.trim(), authorizationId: authorizationId.value.trim() });
}
</script>

<style scoped>
.outline-candidate-panel { display: grid; gap: 14px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }
.panel-header, .candidate-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.panel-header h2, .candidate-heading h3 { margin: 4px 0; }.panel-header p:not(.eyebrow), .candidate-heading p, .candidate-card > p, .empty { margin: 0; color: var(--el-text-color-secondary); }
.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.panel-header button, .candidate-heading button, .selection-button { border: 1px solid var(--el-border-color); border-radius: 7px; padding: 6px 10px; background: transparent; color: var(--el-text-color-primary); cursor: pointer; }.selection-button { justify-self: start; background: var(--el-color-primary); color: white; }.selection-button:disabled { opacity: .5; cursor: not-allowed; }
.candidate-list { display: grid; gap: 12px; }.candidate-card { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--el-color-warning); border-radius: 10px; background: var(--el-fill-color-lighter); }.candidate-card.stale { opacity: .78; border-color: var(--el-border-color); }
.chapter-list, .validation-report ul { margin: 0; padding-left: 20px; }.chapter-list label { display: flex; gap: 8px; align-items: center; }.chapter-list small { color: var(--el-text-color-secondary); }.validation-report { padding: 10px; border-left: 3px solid var(--el-color-success); }.validation-report strong { color: var(--el-color-success); }.error { color: var(--el-color-danger); }
.proposal-status { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--el-color-success); border-radius: 10px; }.proposal-status span { color: var(--el-text-color-secondary); font-size: 13px; }.authorization-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }.authorization-form label { display: grid; gap: 4px; font-size: 12px; color: var(--el-text-color-secondary); }.authorization-form input { padding: 7px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); }.proposal-status button { justify-self: start; padding: 8px 12px; border: 0; border-radius: 7px; background: var(--el-color-success); color: white; cursor: pointer; }
</style>
