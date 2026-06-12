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
        <div class="graph-canvas" aria-label="知识图谱网络">
          <svg viewBox="0 0 720 320" role="img" :aria-label="`图谱网络：${graph.nodes.length} 个节点，${graph.edges.length} 条关系`">
            <defs>
              <marker id="story-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,4 L0,8 Z" />
              </marker>
            </defs>
            <g class="canvas-edges">
              <g v-for="edge in canvasEdges" :key="edge.id">
                <line
                  :x1="edge.x1"
                  :y1="edge.y1"
                  :x2="edge.x2"
                  :y2="edge.y2"
                  :class="{ active: edge.active, dimmed: edge.dimmed }"
                  marker-end="url(#story-graph-arrow)"
                />
                <text v-if="edge.active" :x="edge.labelX" :y="edge.labelY">{{ edge.label }}</text>
              </g>
            </g>
            <g class="canvas-nodes">
              <g
                v-for="node in canvasNodes"
                :key="node.id"
                class="canvas-node"
                :class="{ active: node.active, dimmed: node.dimmed }"
                role="button"
                tabindex="0"
                @click="selectNode(node.id)"
                @keyup.enter="selectNode(node.id)"
              >
                <circle :cx="node.x" :cy="node.y" :r="node.radius" :fill="node.fill" :stroke="node.stroke" />
                <text :x="node.x" :y="node.y + node.radius + 13">{{ node.shortLabel }}</text>
              </g>
            </g>
          </svg>
          <div class="graph-legend" aria-label="图例">
            <span v-for="type in nodeTypes" :key="type">
              <i :style="{ background: nodePalette[type].stroke }"></i>{{ nodeTypeLabels[type] }}
            </span>
          </div>
        </div>

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

const nodeTypes: StoryGraphNodeType[] = ["arc", "character", "event", "chapter", "ledger", "knowledge"];
const nodeTypeLabels: Record<StoryGraphNodeType, string> = {
  arc: "阶段",
  character: "角色",
  event: "事件",
  chapter: "章节",
  ledger: "台账",
  knowledge: "知识"
};
const nodePalette: Record<StoryGraphNodeType, { fill: string; stroke: string }> = {
  arc: { fill: "rgba(59, 130, 246, 0.16)", stroke: "#60a5fa" },
  character: { fill: "rgba(20, 184, 166, 0.16)", stroke: "#2dd4bf" },
  event: { fill: "rgba(245, 158, 11, 0.16)", stroke: "#fbbf24" },
  chapter: { fill: "rgba(168, 85, 247, 0.16)", stroke: "#c084fc" },
  ledger: { fill: "rgba(248, 113, 113, 0.16)", stroke: "#f87171" },
  knowledge: { fill: "rgba(34, 197, 94, 0.16)", stroke: "#4ade80" }
};
const edgeLabels: Record<string, string> = {
  contains: "包含",
  occurs: "发生于",
  involves: "涉及",
  tracks: "追踪",
  references: "引用",
  asserts: "断言",
  knowledge: "知识",
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

const selectedNeighborIds = computed(() => {
  if (!props.graph || !selectedNodeId.value) return new Set<string>();
  const ids = new Set<string>([selectedNodeId.value]);
  for (const edge of props.graph.edges) {
    if (edge.source === selectedNodeId.value) ids.add(edge.target);
    if (edge.target === selectedNodeId.value) ids.add(edge.source);
  }
  return ids;
});

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

const canvasNodes = computed(() => {
  const nodes = (props.graph?.nodes || []).slice(0, 72);
  const groups = new Map<StoryGraphNodeType, typeof nodes>();
  for (const type of nodeTypes) {
    groups.set(type, nodes.filter((node) => node.type === type));
  }
  const selectedIds = selectedNeighborIds.value;
  return nodes.map((node) => {
    const typeIndex = Math.max(0, nodeTypes.indexOf(node.type));
    const group = groups.get(node.type) || [];
    const itemIndex = Math.max(0, group.findIndex((item) => item.id === node.id));
    const x = 54 + typeIndex * (612 / Math.max(1, nodeTypes.length - 1));
    const y = group.length <= 1 ? 160 : 48 + itemIndex * (224 / Math.max(1, group.length - 1));
    const palette = nodePalette[node.type];
    const isActive = node.id === selectedNodeId.value;
    const isRelated = selectedIds.has(node.id);
    return {
      id: node.id,
      x,
      y,
      radius: node.type === "chapter" ? 14 : node.type === "knowledge" ? 11 : 12,
      fill: palette.fill,
      stroke: palette.stroke,
      shortLabel: shortLabel(node.label),
      active: isActive,
      dimmed: Boolean(selectedNodeId.value && !isRelated)
    };
  });
});

const canvasNodeMap = computed(() => new Map(canvasNodes.value.map((node) => [node.id, node])));

const canvasEdges = computed(() => {
  const selectedId = selectedNodeId.value;
  return (props.graph?.edges || [])
    .map((edge) => {
      const source = canvasNodeMap.value.get(edge.source);
      const target = canvasNodeMap.value.get(edge.target);
      if (!source || !target) return null;
      const active = Boolean(selectedId && (edge.source === selectedId || edge.target === selectedId));
      return {
        id: edge.id,
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        labelX: (source.x + target.x) / 2,
        labelY: (source.y + target.y) / 2 - 5,
        label: edgeLabel(edge.label || edge.type),
        active,
        dimmed: Boolean(selectedId && !active)
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
    .slice(0, 140);
});

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

function shortLabel(label: string) {
  return label.length > 8 ? `${label.slice(0, 7)}…` : label;
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
  grid-template-columns: repeat(6, minmax(0, 1fr));
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

.graph-canvas {
  display: grid;
  grid-column: 1 / -1;
  min-height: 330px;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background:
    radial-gradient(circle at 18% 18%, rgba(96, 165, 250, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 42%),
    var(--app-bg-soft);
  overflow: hidden;

  svg {
    width: 100%;
    min-height: 300px;
  }

  marker path {
    fill: color-mix(in srgb, var(--app-text-muted) 72%, transparent);
  }
}

.canvas-edges {
  line {
    stroke: color-mix(in srgb, var(--app-text-muted) 56%, transparent);
    stroke-width: 1.1;
    transition: opacity 0.16s ease, stroke-width 0.16s ease, stroke 0.16s ease;

    &.active {
      stroke: var(--app-primary);
      stroke-width: 2.4;
    }

    &.dimmed {
      opacity: 0.16;
    }
  }

  text {
    fill: var(--app-primary);
    font-size: 10px;
    font-weight: 800;
    paint-order: stroke;
    stroke: var(--app-bg-soft);
    stroke-width: 3px;
  }
}

.canvas-node {
  cursor: pointer;
  outline: none;

  circle {
    stroke-width: 1.8;
    transition: filter 0.16s ease, opacity 0.16s ease, stroke-width 0.16s ease;
  }

  text {
    fill: var(--app-text-secondary);
    font-size: 10px;
    font-weight: 800;
    pointer-events: none;
    text-anchor: middle;
  }

  &.active circle,
  &:focus-visible circle {
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--app-primary) 60%, transparent));
    stroke-width: 3;
  }

  &.dimmed {
    opacity: 0.32;
  }
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  color: var(--app-text-muted);
  font-size: 11px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  i {
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }
}

.node-columns {
  display: grid;
  grid-template-columns: repeat(6, minmax(110px, 1fr));
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

  .graph-canvas {
    min-height: 260px;

    svg {
      min-height: 240px;
    }
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
