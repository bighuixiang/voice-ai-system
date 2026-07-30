<template>
  <section class="publication-evidence-panel" data-testid="publication-evidence-panel" aria-labelledby="publication-evidence-title">
    <header class="panel-header"><div><p class="eyebrow">RP8 delivery evidence</p><h2 id="publication-evidence-title">成稿交付证据</h2><p>版次、出版树、制品、交付证明和发布预检必须来自同一版次。</p></div><button type="button" data-testid="load-publication-evidence" :disabled="loading || !editionId.trim()" @click="emit('load', editionId.trim())">读取版次证据</button></header>
    <label>版次 ID<input data-testid="publication-edition-id" v-model="editionId" placeholder="输入 editionId" /></label>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="!manifest" class="create-form">
      <strong>创建冻结版次</strong>
      <input data-testid="canon-commit-fingerprint" v-model="canonCommitFingerprint" placeholder="canon commit fingerprint" />
      <input data-testid="edition-title" v-model="title" placeholder="标题" />
      <input data-testid="edition-author" v-model="author" placeholder="作者" />
      <input data-testid="edition-language" v-model="language" placeholder="语言" />
      <button type="button" data-testid="create-publication-edition" :disabled="loading || !canonCommitFingerprint.trim() || !title.trim() || !author.trim() || !language.trim()" @click="emit('create', { canonCommitFingerprint: canonCommitFingerprint.trim(), title: title.trim(), author: author.trim(), language: language.trim(), chapters: [] })">创建版次</button>
    </div>
    <div v-if="manifest || tree || artifacts || proof || preflight" class="evidence-grid">
      <span>manifest: {{ manifest?.editionId || "缺失" }}</span>
      <span>tree: {{ tree?.fingerprint || "缺失" }}</span>
      <span>artifacts: {{ artifacts?.fingerprint || "缺失" }}</span>
      <span>delivery proof: {{ proof?.valid ? "valid" : "missing/invalid" }}</span>
      <span>preflight: {{ preflight?.status || "缺失" }}</span>
      <button v-if="manifest && !tree" type="button" data-testid="compile-publication-tree" :disabled="loading" @click="emit('compile-tree')">编译出版树</button>
      <button v-if="tree && !artifacts" type="button" data-testid="render-publication-artifacts" :disabled="loading" @click="emit('render-artifacts')">渲染制品</button>
      <div v-if="preflight?.status === 'ready' && artifacts?.fingerprint && !deliveryProof" class="approval-form">
        <label for="delivery-approval-id">作者批准 ID</label>
        <input id="delivery-approval-id" data-testid="delivery-approval-id" v-model="approvalId" placeholder="输入作者批准 ID" />
        <button type="button" data-testid="issue-delivery-proof" :disabled="loading || !approvalId.trim()" @click="emit('issue-proof', approvalId.trim())">签发交付证明</button>
      </div>
    </div>
    <p v-else class="empty">尚未读取版次交付证据。</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { DeliveryProof, DeliveryProofVerification, EditionManifest, PublicationArtifactSet, PublicationTree, ReleasePreflightReport } from "@/types/novel";
withDefaults(defineProps<{ manifest?: EditionManifest | null; tree?: PublicationTree | null; artifacts?: PublicationArtifactSet | null; proof?: DeliveryProofVerification | null; deliveryProof?: DeliveryProof | null; preflight?: ReleasePreflightReport | null; loading?: boolean; error?: string }>(), { manifest: null, tree: null, artifacts: null, proof: null, deliveryProof: null, preflight: null, loading: false, error: "" });
const emit = defineEmits<{ load: [editionId: string]; create: [input: { canonCommitFingerprint: string; title: string; author: string; language: string; chapters: [] }]; "compile-tree": []; "render-artifacts": []; "issue-proof": [approvalId: string] }>();
const editionId = ref("");
const approvalId = ref("");
const canonCommitFingerprint = ref("");
const title = ref("");
const author = ref("");
const language = ref("");
</script>

<style scoped>
.publication-evidence-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }.panel-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }.panel-header h2 { margin: 4px 0; }.panel-header p:not(.eyebrow), .empty { margin: 0; color: var(--el-text-color-secondary); }.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }.panel-header button, .approval-form button, .create-form button, .evidence-grid button { border: 1px solid var(--el-border-color); border-radius: 7px; padding: 7px 10px; background: var(--el-color-primary); color: white; cursor: pointer; }.panel-header button:disabled, .approval-form button:disabled, .create-form button:disabled, .evidence-grid button:disabled { opacity: .55; cursor: not-allowed; }.publication-evidence-panel > label { display: grid; gap: 5px; color: var(--el-text-color-secondary); font-size: 13px; }.publication-evidence-panel input { padding: 7px 9px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); }.create-form { display: grid; gap: 7px; padding: 12px; border-left: 3px solid var(--el-color-primary); background: var(--el-fill-color-lighter); }.create-form button { justify-self: start; }.evidence-grid { display: grid; gap: 7px; padding: 12px; border-left: 3px solid var(--el-color-primary); background: var(--el-fill-color-lighter); font-size: 13px; }.evidence-grid button { justify-self: start; }.approval-form { display: grid; gap: 6px; padding-top: 8px; border-top: 1px solid var(--el-border-color); }.approval-form label { color: var(--el-text-color-secondary); font-size: 13px; }.approval-form button { justify-self: start; }.error { color: var(--el-color-danger); }
</style>
