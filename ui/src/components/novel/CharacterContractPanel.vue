<template>
  <section class="character-contract-panel">
    <header><strong>人物戏剧契约</strong><button type="button" data-testid="refresh-character-contracts" @click="emit('refresh')">刷新</button></header>
    <article v-for="contract in contracts" :key="contract.contractId" class="contract-card">
      <div class="title"><strong>{{ contract.displayName }}</strong><span>{{ contract.lifecycle }}</span></div>
      <p>外在欲望：{{ contract.externalWant }}；内在需要：{{ contract.internalNeed }}</p>
      <p>错误信念：{{ contract.falseBelief }}；代价：{{ contract.stake }}</p>
      <small>未决 unknown：{{ contract.unknown.join("、") }}</small>
      <small>来源：{{ contract.sources.map((source) => `${source.field}:${source.provenance}`).join("；") }}</small>
      <button v-if="contract.lifecycle === 'candidate'" type="button" :data-testid="`confirm-character-${contract.contractId}`" @click="emit('confirm', contract)">作者确认契约</button>
    </article>
    <p v-if="!contracts.length" class="muted">暂无人物契约。</p>
  </section>
</template>

<script setup lang="ts">
import type { CharacterDramaticContract } from "@/types/novel";
withDefaults(defineProps<{ contracts?: CharacterDramaticContract[] }>(), { contracts: () => [] });
const emit = defineEmits<{ refresh: []; confirm: [contract: CharacterDramaticContract] }>();
</script>

<style scoped>
.character-contract-panel { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; background: var(--el-bg-color); }
header, .title { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.contract-card { display: grid; gap: 4px; padding: 8px; border-left: 3px solid var(--el-color-success); background: var(--el-fill-color-lighter); }
.contract-card p, .contract-card small { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }
button { padding: 4px 8px; border: 1px solid var(--el-border-color); border-radius: 5px; background: var(--el-fill-color-light); color: var(--el-text-color-primary); cursor: pointer; }
.muted { color: var(--el-text-color-placeholder); }
</style>
