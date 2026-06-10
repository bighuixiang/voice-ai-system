<template>
  <section class="story-graph-panel" aria-label="故事图谱">
    <header>
      <div>
        <div class="panel-title">故事图谱</div>
        <p>{{ summaryText }}</p>
      </div>
      <el-button :icon="Refresh" :disabled="!graph" @click="$emit('refresh')">刷新</el-button>
    </header>

    <div v-if="graph" class="graph-body">
      <div class="node-stats">
        <div v-for="item in nodeStats" :key="item.type">
          <strong>{{ item.count }}</strong>
          <span>{{ item.type }}</span>
        </div>
      </div>

      <div class="edge-list">
        <div v-for="edge in visibleEdges" :key="edge.id" class="edge-row">
          <span>{{ labelFor(edge.source) }}</span>
          <em>{{ edgeLabel(edge.label || edge.type) }}</em>
          <span>{{ labelFor(edge.target) }}</span>
        </div>
        <p v-if="!visibleEdges.length" class="empty-state">暂无关系投影。</p>
      </div>
    </div>
    <p v-else class="empty-state">暂无故事图谱。</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import type { StoryGraphNodeType, StoryGraphProjection } from "@/types/novel";

const props = defineProps<{
  graph: StoryGraphProjection | null;
}>();

defineEmits<{
  refresh: [];
}>();

const nodeTypes: StoryGraphNodeType[] = ["arc", "character", "event", "chapter", "ledger"];
const nodeTypeLabels: Record<StoryGraphNodeType, string> = {
  arc: "阶段",
  character: "角色",
  event: "事件",
  chapter: "章节",
  ledger: "台账"
};
const edgeLabels: Record<string, string> = {
  contains: "包含",
  occurs: "发生于",
  involves: "涉及",
  tracks: "追踪",
  references: "引用",
  foreshadowing: "伏笔",
  continuity: "连续性",
  power: "战力",
  character: "角色",
  risk: "风险"
};

const nodeStats = computed(() =>
  nodeTypes.map((type) => ({
    type: nodeTypeLabels[type],
    count: props.graph?.nodes.filter((node) => node.type === type).length || 0
  }))
);

const visibleEdges = computed(() => (props.graph?.edges || []).slice(0, 12));

const summaryText = computed(() => {
  if (!props.graph) return "从总控、章节与台账生成";
  return `${props.graph.nodes.length} 个节点 / ${props.graph.edges.length} 条关系`;
});

function labelFor(id: string) {
  return props.graph?.nodes.find((node) => node.id === id)?.label || id;
}

function edgeLabel(label: string) {
  return edgeLabels[label] || label;
}
</script>

<style scoped lang="scss">
.story-graph-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

header,
.edge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-title {
  color: #111827;
  font-size: 14px;
  font-weight: 800;
}

p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 12px;
}

.graph-body {
  display: grid;
  gap: 10px;
}

.node-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;

  div {
    display: grid;
    min-width: 0;
    gap: 2px;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    background: #f8fafc;
  }

  strong {
    color: #0f172a;
    font-size: 17px;
    line-height: 1;
  }

  span {
    overflow: hidden;
    color: #64748b;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.edge-list {
  display: grid;
  gap: 5px;
}

.edge-row {
  min-width: 0;
  min-height: 34px;
  padding: 7px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  color: #0f172a;
  font-size: 12px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    flex: 0 0 auto;
    color: #2563eb;
    font-style: normal;
    font-weight: 700;
  }
}

.empty-state {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #f8fafc;
}

@media (max-width: 760px) {
  .node-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
