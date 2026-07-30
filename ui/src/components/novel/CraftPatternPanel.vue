<template>
  <section class="craft-pattern-panel">
    <header><strong>工艺模式审阅</strong><small>候选与 canon 隔离</small></header>
    <button type="button" data-testid="refresh-craft-catalog" @click="emit('refresh')">刷新工艺目录</button>
    <article v-for="item in patterns" :key="item.patternId" class="pattern-card">
      <div class="pattern-title"><strong>{{ item.name }}</strong><span>{{ item.lifecycle }}</span></div>
      <p>{{ item.mechanism }}；功能：{{ item.narrativeFunction }}</p>
      <small>适用：{{ item.applicability.join("、") }}；反例：{{ item.counterexamples.join("、") || "无" }}</small>
      <small>来源证据：{{ item.evidenceRefs.join("、") }}</small>
      <small>权利快照：{{ item.sourceEnvelopeIds.join("、") }}</small>
      <small>不会自动写入 canon；必须经过独立实验和作者决定。</small>
      <button v-if="item.lifecycle === 'probation' && judgedExperiments(item).length" type="button" :data-testid="`validate-pattern-${item.patternId}`" @click="emit('validate', item, judgedExperiments(item)[0])">验证为 validated</button>
      <button v-if="item.lifecycle === 'approved'" type="button" :data-testid="`promote-pattern-${item.patternId}`" @click="emit('promote', item)">申请 probation 实验</button>
    </article>
    <p v-if="!patterns.length" class="muted">暂无工艺模式。</p>
  </section>
</template>

<script setup lang="ts">
import type { CraftExperiment, CraftPattern } from "@/types/novel";

const props = withDefaults(defineProps<{ patterns?: CraftPattern[]; experiments?: Record<string, CraftExperiment> }>(), { patterns: () => [], experiments: () => ({}) });
const emit = defineEmits<{ validate: [pattern: CraftPattern, experiment: CraftExperiment]; promote: [pattern: CraftPattern]; refresh: [] }>();
function judgedExperiments(pattern: CraftPattern) { return Object.values(props.experiments).filter((experiment) => experiment.transferPlanId && experiment.status === "judged" && experiment.judgment?.winner === "treatment" && experiment.judgment.hardGuardsPassed && experiment.experimentId !== pattern.promotion?.experimentId); }
</script>

<style scoped>
.craft-pattern-panel { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; background: var(--el-bg-color); }
.craft-pattern-panel header, .pattern-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.pattern-card { display: grid; gap: 4px; padding: 8px; border-left: 3px solid var(--el-color-primary); background: var(--el-fill-color-lighter); }
.pattern-card p, .pattern-card small { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }
.pattern-card button { justify-self: start; padding: 4px 8px; border: 1px solid var(--el-border-color); border-radius: 5px; background: var(--el-fill-color-light); color: var(--el-text-color-primary); cursor: pointer; }
.muted { color: var(--el-text-color-placeholder); }
</style>
