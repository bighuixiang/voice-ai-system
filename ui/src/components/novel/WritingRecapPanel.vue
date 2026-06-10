<template>
  <section class="recap-panel" aria-label="写后复盘候选">
    <div v-if="!candidate" class="empty-state">
      <strong>暂无写作回顾</strong>
      <p>当前章节保存后可生成一份账本候选。</p>
      <el-button size="small" type="primary" :loading="loading" :disabled="!canRequest" @click="$emit('request')">
        生成回顾
      </el-button>
    </div>

    <template v-else>
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
    </template>
  </section>
</template>

<script setup lang="ts">
import type { WritingRecapCandidate } from "@/types/novel";

withDefaults(defineProps<{
  candidate: WritingRecapCandidate | null;
  canRequest?: boolean;
  loading?: boolean;
}>(), {
  canRequest: false,
  loading: false
});

defineEmits<{
  accept: [];
  reject: [];
  request: [];
}>();
</script>

<style scoped lang="scss">
.recap-panel {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);
}

.empty-state {
  display: grid;
  gap: 8px;
  justify-items: start;

  strong {
    color: var(--app-text-primary);
  }

  p {
    margin: 0;
    color: var(--app-text-muted);
    font-size: 13px;
  }
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--app-text-primary);
  font-weight: 700;
  margin-bottom: 8px;
}

.summary {
  margin: 0 0 10px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.recap-section {
  margin-top: 8px;

  h3 {
    margin: 0 0 4px;
    color: var(--app-text-primary);
    font-size: 13px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    color: var(--app-text-secondary);
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
    border: 1px solid var(--app-primary);
    border-radius: 6px;
    background: var(--app-primary-soft);
    color: var(--app-primary);
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
