<template>
  <section class="story-graph-panel" aria-label="故事图谱">
    <header>
      <div>
        <div class="panel-title">故事图谱</div>
        <p>{{ summaryText }}</p>
      </div>
      <el-button :icon="Refresh" :loading="isRebuilding" :disabled="isRebuilding" @click="$emit('refresh')">刷新</el-button>
    </header>

    <div v-if="graph" class="graph-body">
      <div class="node-stats">
        <div v-for="item in nodeStats" :key="item.type">
          <strong>{{ item.count }}</strong>
          <span>{{ item.type }}</span>
        </div>
      </div>

      <div class="graph-map" aria-label="关系地图">
        <div class="node-columns">
          <div v-for="column in groupedNodeColumns" :key="column.type" class="node-column">
            <div class="column-title">
              <span>{{ column.label }}</span>
              <strong>{{ column.nodes.length }}</strong>
            </div>
            <button
              v-for="node in column.nodes"
              :key="node.id"
              class="node-chip"
              :class="{ active: node.id === selectedNodeId }"
              type="button"
              @click="selectNode(node.id)"
            >
              <span>{{ node.label }}</span>
              <small>{{ node.subtitle || node.status || "未备注" }}</small>
            </button>
            <p v-if="!column.nodes.length" class="compact-empty">暂无节点</p>
          </div>
        </div>

        <aside v-if="selectedNode" class="node-detail" aria-label="选中节点关系">
          <div class="detail-heading">
            <span>{{ nodeTypeLabels[selectedNode.type] }}</span>
            <strong>{{ selectedNode.label }}</strong>
          </div>
          <p>{{ selectedNode.subtitle || selectedNode.status || "暂无节点说明" }}</p>

          <div class="relation-list">
            <div v-for="row in selectedRelationRows" :key="row.id" class="relation-row">
              <span>{{ row.direction }}</span>
              <em>{{ row.relation }}</em>
              <strong>{{ row.node }}</strong>
            </div>
            <p v-if="!selectedRelationRows.length" class="compact-empty">暂无相邻关系。</p>
          </div>
        </aside>
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
import { computed, ref, watch } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import type { StoryGraphNodeType, StoryGraphProjection } from "@/types/novel";

const props = defineProps<{
  graph: StoryGraphProjection | null;
  isRebuilding?: boolean;
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

const selectedNodeId = ref<string | null>(null);

const graphNodeIds = computed(() => props.graph?.nodes.map((node) => node.id) || []);

watch(
  graphNodeIds,
  (ids) => {
    if (!ids.length) {
      selectedNodeId.value = null;
      return;
    }
    if (!selectedNodeId.value || !ids.includes(selectedNodeId.value)) {
      selectedNodeId.value = ids[0];
    }
  },
  { immediate: true }
);

const groupedNodeColumns = computed(() =>
  nodeTypes.map((type) => ({
    type,
    label: nodeTypeLabels[type],
    nodes: props.graph?.nodes.filter((node) => node.type === type) || []
  }))
);

const selectedNode = computed(() => props.graph?.nodes.find((node) => node.id === selectedNodeId.value) || null);

const selectedRelationRows = computed(() => {
  if (!props.graph || !selectedNodeId.value) return [];
  return props.graph.edges
    .filter((edge) => edge.source === selectedNodeId.value || edge.target === selectedNodeId.value)
    .map((edge) => {
      const isOutgoing = edge.source === selectedNodeId.value;
      const adjacentId = isOutgoing ? edge.target : edge.source;
      return {
        id: edge.id,
        direction: isOutgoing ? "指向" : "来自",
        relation: edgeLabel(edge.label || edge.type),
        node: labelFor(adjacentId)
      };
    });
});

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

function selectNode(id: string) {
  selectedNodeId.value = id;
}
</script>

<style scoped lang="scss">
.story-graph-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
  color: var(--app-text-primary);
}

header,
.edge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-title {
  color: var(--app-text-primary);
  font-size: 14px;
  font-weight: 800;
}

p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
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
    border: 1px solid var(--app-border);
    border-radius: 7px;
    background: var(--app-bg-soft);
  }

  strong {
    color: var(--app-text-primary);
    font-size: 17px;
    line-height: 1;
  }

  span {
    overflow: hidden;
    color: var(--app-text-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.edge-list {
  display: grid;
  gap: 5px;
}

.graph-map {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 260px);
  gap: 10px;
  align-items: stretch;
}

.node-columns {
  display: grid;
  grid-template-columns: repeat(5, minmax(110px, 1fr));
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
}

.node-column {
  display: grid;
  align-content: start;
  min-width: 110px;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
}

.column-title,
.detail-heading,
.relation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.column-title {
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 800;

  strong {
    color: var(--app-text-primary);
  }
}

.node-chip {
  display: grid;
  min-height: 48px;
  min-width: 0;
  gap: 3px;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
  color: var(--app-text-primary);
  cursor: pointer;
  text-align: left;

  span,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    font-size: 12px;
    font-weight: 800;
  }

  small {
    color: var(--app-text-muted);
    font-size: 11px;
  }

  &.active {
    border-color: var(--app-primary);
    background: var(--app-primary-soft);
  }
}

.node-detail {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

.detail-heading {
  span {
    color: var(--app-primary);
    font-size: 11px;
    font-weight: 800;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--app-text-primary);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.relation-list {
  display: grid;
  gap: 6px;
}

.relation-row {
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-text-primary);
  font-size: 12px;

  span,
  em {
    flex: 0 0 auto;
    color: var(--app-text-muted);
  }

  em {
    color: var(--app-primary);
    font-style: normal;
    font-weight: 800;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.edge-row {
  min-width: 0;
  min-height: 34px;
  padding: 7px 8px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  color: var(--app-text-primary);
  font-size: 12px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    flex: 0 0 auto;
    color: var(--app-primary);
    font-style: normal;
    font-weight: 700;
  }
}

.empty-state {
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

.compact-empty {
  margin: 0;
  padding: 7px;
  border: 1px dashed var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-text-muted);
  font-size: 11px;
}

@media (max-width: 760px) {
  .node-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .graph-map {
    grid-template-columns: 1fr;
  }

  .node-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow-x: visible;
  }
}
</style>
