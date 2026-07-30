<template>
  <section class="learning-governance" data-testid="learning-governance-panel">
    <header><strong>学习与探索边界</strong><button type="button" @click="emit('refresh')">刷新</button></header>
    <p v-if="policy">策略：至少 {{ policy.minIndependentEvidence }} 条独立证据；置信度阈值 {{ policy.confidenceThreshold }}；范围 {{ policy.privacyBoundary }}。</p>
    <p v-else class="muted">尚未加载学习策略。</p>
    <article v-for="budget in Object.values(budgets)" :key="budget.budgetId" class="budget-card">
      <strong>{{ budget.scope }} · {{ budget.status }}</strong>
      <p>探索次数 {{ budget.usedProbes }} / {{ budget.maxProbes }}；成本 {{ budget.usedCost }} / {{ budget.maxCost }}</p>
      <small>影响范围：{{ budget.maxImpact }}；停止条件：{{ budget.stopConditions.join("、") || "无" }}</small>
      <button v-if="budget.status === 'active'" type="button" :data-testid="`pause-budget-${budget.budgetId}`" :disabled="loading" @click="emit('pause', budget)">暂停探索</button>
      <small v-if="budget.status === 'paused'" class="muted">暂停原因：{{ budget.pauseReason }}</small>
    </article>
    <p v-if="!Object.keys(budgets).length" class="muted">当前没有探索预算。</p>
  </section>
</template>

<script setup lang="ts">
import type { ExplorationBudget, LearningPolicy } from "@/types/novel";

withDefaults(defineProps<{ policy?: LearningPolicy | null; budgets?: Record<string, ExplorationBudget>; loading?: boolean }>(), { policy: null, budgets: () => ({}), loading: false });
const emit = defineEmits<{ refresh: []; pause: [budget: ExplorationBudget] }>();
</script>

<style scoped>
.learning-governance { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; background: var(--el-bg-color); }
.learning-governance header { display: flex; justify-content: space-between; align-items: center; }
.learning-governance button { justify-self: start; padding: 4px 8px; border: 1px solid var(--el-border-color); border-radius: 5px; background: var(--el-fill-color-light); color: var(--el-text-color-primary); cursor: pointer; }
.budget-card { display: grid; gap: 4px; padding: 8px; border-left: 3px solid var(--el-color-warning); background: var(--el-fill-color-lighter); }
.learning-governance p, .learning-governance small { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }
.muted { color: var(--el-text-color-placeholder); }
</style>
