<template>
  <section class="memory-governance-panel" aria-label="记忆治理证据">
    <header>
      <div>
        <strong>记忆治理</strong>
        <p>健康、连续性和生成前就绪证明的持久证据</p>
      </div>
      <button type="button" :disabled="loading || !retrievalAvailable" @click="$emit('run')">
        {{ loading ? "运行中" : "运行门禁" }}
      </button>
    </header>

    <p v-if="!retrievalAvailable" class="governance-hint">请先创建检索预览，才能生成就绪证明。</p>

    <div class="governance-evidence">
      <article>
        <span>健康状态</span>
        <strong>{{ health?.status || "未运行" }}</strong>
        <small v-if="health?.reportId">{{ health.reportId }}</small>
        <small v-if="health?.coverage">已结算章节 {{ health.coverage.settledChapters }}/{{ health.coverage.totalChapters }} · 实体 {{ health.coverage.entityCount }} · 时效性事实 {{ health.coverage.timeBoundClaims }}</small>
        <small v-if="health?.coverage">角色知识 {{ health.coverage.characterKnowledgeEntries }} · 读者知识 {{ health.coverage.readerKnowledgeEntries }}</small>
        <small v-for="risk in health?.risks || []" :key="risk">风险：{{ risk }}</small>
      </article>
      <article>
        <span>就绪证明</span>
        <strong>{{ readyProof?.status || "未运行" }}</strong>
        <small v-for="blocker in readyProof?.blockers || []" :key="blocker">{{ blocker }}</small>
      </article>
      <article>
        <span>连续性审计</span>
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
