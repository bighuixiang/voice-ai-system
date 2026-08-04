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

      <div v-if="candidate.summaryPatch" class="recap-section">
        <h3>章节摘要补丁</h3>
        <p class="patch-note">{{ candidate.summaryPatch.summary || candidate.summary }}</p>
        <ul v-if="candidate.summaryPatch.keyEvents?.length">
          <li v-for="event in candidate.summaryPatch.keyEvents" :key="event">{{ event }}</li>
        </ul>
      </div>

      <div class="recap-section">
        <h3>新增事实</h3>
        <ul>
          <li v-for="fact in candidate.newFacts" :key="fact">{{ fact }}</li>
        </ul>
      </div>

      <div v-if="candidate.factPatches?.length" class="recap-section">
        <h3>事实补丁</h3>
        <ul>
          <li v-for="fact in candidate.factPatches" :key="fact.id">
            <strong>{{ fact.fact }}</strong>
            <span v-if="fact.relatedEntities.length"> - {{ fact.relatedEntities.join(" / ") }}</span>
          </li>
        </ul>
      </div>

      <div class="recap-section">
        <h3>人物状态变化</h3>
        <ul>
          <li v-for="change in candidate.characterStateChanges" :key="change">{{ change }}</li>
        </ul>
      </div>

      <div v-if="candidate.characterStatePatches?.length" class="recap-section">
        <h3>人物状态补丁</h3>
        <ul>
          <li v-for="change in candidate.characterStatePatches" :key="change.id">
            <strong>{{ change.characterName }}</strong>
            <span> - {{ change.after }}</span>
            <small v-if="change.cause">{{ change.cause }}</small>
          </li>
        </ul>
      </div>

      <div v-if="emotionLedgerItems.length" class="recap-section">
        <h3>情绪账本补丁</h3>
        <ul>
          <li v-for="item in emotionLedgerItems" :key="`${item.kind}-${item.id}`">
            <strong>{{ item.label }}</strong>
            <span> - {{ item.characterName || "未指定角色" }}：{{ item.description }}</span>
            <small v-if="item.cause">{{ item.cause }}</small>
          </li>
        </ul>
      </div>

      <div class="ledger-preview">
        <span>伏笔 {{ candidate.foreshadowingUpdates.length }}</span>
        <span>风险 {{ candidate.continuityRisks.length }}</span>
        <span>升级 {{ candidate.powerProgressionUpdates.length }}</span>
        <span v-if="emotionLedgerItems.length">情绪 {{ emotionLedgerItems.length }}</span>
      </div>

      <div v-if="candidate.craftBeatPatches?.length" class="recap-section">
        <h3>创作节拍补丁</h3>
        <ul>
          <li v-for="beat in candidate.craftBeatPatches" :key="beat.id">
            <strong>{{ beat.label }}</strong>
            <span> - {{ beat.type }} / {{ beat.status }}</span>
            <small v-if="beat.payoff || beat.cost">{{ beat.payoff || beat.cost }}</small>
          </li>
        </ul>
      </div>

      <div v-if="ledgerPatchItems.length" class="recap-section">
        <h3>账本补丁</h3>
        <ul>
          <li v-for="entry in ledgerPatchItems" :key="entry.id">
            <strong>{{ entry.title }}</strong>
            <span> - {{ entry.kind }} / {{ entry.status }} / {{ entry.severity }}</span>
            <small>{{ entry.note }}</small>
          </li>
        </ul>
      </div>

      <div class="panel-actions">
        <el-button type="success" size="small" @click="$emit('accept')">接受到账本</el-button>
        <el-button size="small" @click="$emit('reject')">忽略</el-button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LedgerEntry, WritingRecapCandidate } from "@/types/novel";

const props = withDefaults(defineProps<{
  candidate: WritingRecapCandidate | null;
  canRequest?: boolean;
  loading?: boolean;
}>(), {
  canRequest: false,
  loading: false
});

const ledgerPatchItems = computed<LedgerEntry[]>(() => [
  ...(props.candidate?.ledgerPatches || []),
  ...(props.candidate?.riskPatches || [])
]);

const emotionLedgerItems = computed(() => {
  const ledger = props.candidate?.emotionLedgerPatch;
  if (!ledger) return [];
  return [
    ...(ledger.wounds || []).map((item) => ({ ...item, kind: "wounds", label: "伤口" })),
    ...(ledger.boons || []).map((item) => ({ ...item, kind: "boons", label: "收益" })),
    ...(ledger.powerShifts || []).map((item) => ({ ...item, kind: "powerShifts", label: "权力变化" })),
    ...(ledger.openLoops || []).map((item) => ({ ...item, kind: "openLoops", label: "未闭合问题" }))
  ];
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

  small {
    display: block;
    color: var(--app-text-muted);
    font-size: 12px;
  }
}

.patch-note {
  margin: 0 0 6px;
  color: var(--app-text-secondary);
  line-height: 1.5;
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
