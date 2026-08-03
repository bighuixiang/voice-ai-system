<template>
  <section class="memory-governance-panel" aria-label="memory governance evidence">
    <header>
      <div>
        <strong>Memory governance</strong>
        <p>健康、连续性和生成前 ready proof 的持久证据</p>
      </div>
      <button type="button" :disabled="loading || !retrievalAvailable" @click="$emit('run')">
        {{ loading ? "运行中" : "运行门禁" }}
      </button>
    </header>

    <p v-if="!retrievalAvailable" class="governance-hint">请先创建检索预览，才能生成 ready proof。</p>

    <div class="governance-evidence">
      <article>
        <span>Health</span>
        <strong>{{ health?.status || "未运行" }}</strong>
        <small v-if="health?.reportId">{{ health.reportId }}</small>
        <small v-if="health?.coverage">chapters {{ health.coverage.settledChapters }}/{{ health.coverage.totalChapters }} · entities {{ health.coverage.entityCount }} · time-bound {{ health.coverage.timeBoundClaims }}</small>
        <small v-if="health?.coverage">character knowledge {{ health.coverage.characterKnowledgeEntries }} · reader knowledge {{ health.coverage.readerKnowledgeEntries }}</small>
        <small v-for="risk in health?.risks || []" :key="risk">risk: {{ risk }}</small>
      </article>
      <article>
        <span>Ready proof</span>
        <strong>{{ readyProof?.status || "未运行" }}</strong>
        <small v-for="blocker in readyProof?.blockers || []" :key="blocker">{{ blocker }}</small>
      </article>
      <article>
        <span>Continuity audit</span>
        <strong>{{ continuityAudit?.status || "未运行" }}</strong>
        <small v-for="issue in continuityAudit?.issues || []" :key="issue">{{ issue }}</small>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  health?: { reportId: string; status: string; risks?: string[]; coverage?: { totalChapters: number; settledChapters: number; eligibleClaims: number; candidateClaims?: number; entityCount: number; timeBoundClaims: number; characterKnowledgeEntries: number; readerKnowledgeEntries: number } } | null;
  readyProof?: { proofId: string; status: string; blockers?: string[] } | null;
  continuityAudit?: { auditId: string; status: string; issues?: string[] } | null;
  retrievalAvailable: boolean;
  loading: boolean;
}>();

defineEmits<{ run: [] }>();
</script>
