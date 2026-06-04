<template>
  <section v-if="candidate" class="recap-panel" aria-label="写后复盘候选">
    <div class="panel-title">
      <span>写后复盘候选</span>
      <el-tag size="small">待确认</el-tag>
    </div>

    <p class="summary">{{ candidate.summary }}</p>

    <div class="recap-section">
      <h3>新增事实</h3>
      <ul>
        <li v-for="fact in candidate.newFacts" :key="fact">{{ fact }}</li>
      </ul>
    </div>

    <div class="recap-section">
      <h3>人物状态变化</h3>
      <ul>
        <li v-for="change in candidate.characterStateChanges" :key="change">{{ change }}</li>
      </ul>
    </div>

    <div class="ledger-preview">
      <span>伏笔 {{ candidate.foreshadowingUpdates.length }}</span>
      <span>风险 {{ candidate.continuityRisks.length }}</span>
      <span>升级 {{ candidate.powerProgressionUpdates.length }}</span>
    </div>

    <div class="panel-actions">
      <el-button type="success" size="small" @click="$emit('accept')">接受到账本</el-button>
      <el-button size="small" @click="$emit('reject')">忽略</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { WritingRecapCandidate } from "@/types/novel";

defineProps<{
  candidate: WritingRecapCandidate | null;
}>();

defineEmits<{
  accept: [];
  reject: [];
}>();
</script>

<style scoped lang="scss">
.recap-panel {
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  margin-bottom: 8px;
}

.summary {
  margin: 0 0 10px;
  color: #1f2937;
  line-height: 1.5;
}

.recap-section {
  margin-top: 8px;

  h3 {
    margin: 0 0 4px;
    font-size: 13px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    color: #4b5563;
    line-height: 1.6;
  }
}

.ledger-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;

  span {
    padding: 3px 7px;
    border: 1px solid #93c5fd;
    border-radius: 6px;
    background: #ffffff;
    color: #1d4ed8;
    font-size: 12px;
  }
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
