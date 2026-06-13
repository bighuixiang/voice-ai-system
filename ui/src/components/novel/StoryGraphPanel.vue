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

      <div v-if="characterRelations" class="character-relations" aria-label="角色关系图">
        <div class="relation-header">
          <div>
            <strong>角色关系图</strong>
            <span>{{ relationSummaryText }}</span>
          </div>
          <div class="relation-badges">
            <span>{{ characterRelations.characters.length }} characters</span>
            <span>{{ characterRelations.relationships.length }} relations</span>
            <span>{{ isolatedCoverage.length }} isolated</span>
          </div>
        </div>

        <div class="relation-layout">
          <div class="relation-canvas" aria-label="角色关系网络">
            <svg viewBox="0 0 560 260" role="img" :aria-label="`角色关系网络：${characterRelations.characters.length} 个角色，${characterRelations.relationships.length} 条关系`">
              <defs>
                <marker id="character-relation-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              <g class="relation-edges">
                <g v-for="edge in relationCanvasEdges" :key="edge.id">
                  <line
                    :x1="edge.x1"
                    :y1="edge.y1"
                    :x2="edge.x2"
                    :y2="edge.y2"
                    :class="{ active: edge.active, dimmed: edge.dimmed }"
                    marker-end="url(#character-relation-arrow)"
                    @click="selectRelationship(edge.id)"
                  />
                  <text v-if="edge.active" :x="edge.labelX" :y="edge.labelY">{{ edge.label }}</text>
                </g>
              </g>
              <g class="relation-nodes">
                <g
                  v-for="node in relationCanvasNodes"
                  :key="node.id"
                  class="relation-node"
                  :class="{ active: node.active, dimmed: node.dimmed, isolated: node.isolated }"
                >
                  <circle :cx="node.x" :cy="node.y" :r="node.radius" />
                  <text :x="node.x" :y="node.y + node.radius + 13">{{ node.shortLabel }}</text>
                </g>
              </g>
            </svg>
          </div>

          <aside class="relation-detail" aria-label="角色关系证据">
            <div v-if="selectedRelationship" class="relation-card selected">
              <div class="relation-title">
                <span>{{ selectedRelationship.sourceName }}</span>
                <em>{{ selectedRelationship.label }}</em>
                <span>{{ selectedRelationship.targetName }}</span>
              </div>
              <p>{{ selectedRelationship.weight }} evidence · {{ selectedRelationship.chapterIds.join(", ") || "no chapter" }}</p>
              <div class="evidence-list">
                <div v-for="item in selectedRelationship.evidence.slice(0, 4)" :key="`${item.sourceType}:${item.sourceId}:${item.label}`">
                  <span>{{ sourceTypeLabel(item.sourceType) }}</span>
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.note || item.chapterIds.join(", ") || item.sourceId }}</small>
                </div>
              </div>
            </div>
            <p v-else class="compact-empty">暂无可选角色关系。</p>

            <div class="coverage-list">
              <div class="coverage-title">覆盖度</div>
              <div v-for="item in coverageRows" :key="item.characterId" class="coverage-row" :class="{ isolated: item.isolated }">
                <span>{{ item.name }}</span>
                <em>{{ item.relationshipCount }} relations</em>
                <small>{{ coverageHint(item) }}</small>
              </div>
            </div>
            <div class="appearance-schedule" aria-label="角色登场调度">
              <div class="coverage-title">登场调度</div>
              <div
                v-for="item in appearanceSignalRows"
                :key="item.characterId"
                class="schedule-row"
                :class="scheduleStatusClass(item.status)"
              >
                <div>
                  <span>{{ item.name }}</span>
                  <em>{{ scheduleStatusLabel(item.status) }}</em>
                </div>
                <small>{{ scheduleSignalHint(item) }}</small>
              </div>
              <p v-if="!appearanceSignalRows.length" class="compact-empty">暂无调度信号。</p>
            </div>
          </aside>
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
import { computed, ref, watch } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import type {
  CharacterAppearanceSignal,
  CharacterRelationshipCoverage,
  CharacterRelationshipSourceType,
  CharacterScheduleStatus,
  StoryGraphNodeType,
  StoryGraphProjection
} from "@/types/novel";

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
  relationship: "角色关系",
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

const characterRelations = computed(() => props.graph?.characterRelations || null);
const selectedRelationshipId = ref<string | null>(null);
const relationshipIds = computed(() => characterRelations.value?.relationships.map((item) => item.id) || []);

watch(
  relationshipIds,
  (ids) => {
    if (!ids.length) {
      selectedRelationshipId.value = null;
      return;
    }
    if (!selectedRelationshipId.value || !ids.includes(selectedRelationshipId.value)) {
      selectedRelationshipId.value = ids[0];
    }
  },
  { immediate: true }
);

const selectedRelationship = computed(
  () => characterRelations.value?.relationships.find((item) => item.id === selectedRelationshipId.value) || null
);

const selectedRelationshipCharacterIds = computed(() => {
  const relation = selectedRelationship.value;
  if (!relation) return new Set<string>();
  return new Set([relation.sourceCharacterId, relation.targetCharacterId]);
});

const isolatedCoverage = computed(() => characterRelations.value?.coverage.filter((item) => item.isolated) || []);

const coverageRows = computed(() =>
  [...(characterRelations.value?.coverage || [])].sort((left, right) => {
    if (left.isolated !== right.isolated) return left.isolated ? -1 : 1;
    return right.relationshipCount - left.relationshipCount || left.name.localeCompare(right.name);
  })
);

const appearanceSignalRows = computed(() => {
  const statusOrder: Record<CharacterScheduleStatus, number> = {
    "should-appear": 0,
    absent: 1,
    overexposed: 2,
    balanced: 3
  };
  return [...(characterRelations.value?.appearanceSignals || [])].sort((left, right) => {
    return statusOrder[left.status] - statusOrder[right.status] || left.priority - right.priority || left.name.localeCompare(right.name);
  });
});

const relationSummaryText = computed(() => {
  const graph = characterRelations.value;
  if (!graph) return "从知识三元组、事件共同登场和人物备注生成";
  const evidenceCount = graph.relationships.reduce((sum, item) => sum + item.evidence.length, 0);
  return `从 ${evidenceCount} 条证据生成，帮助检查角色是否孤立、关系是否有正文支撑`;
});

const relationCanvasNodes = computed(() => {
  const graph = characterRelations.value;
  if (!graph) return [];
  const total = Math.max(1, graph.characters.length);
  const isolatedIds = new Set(isolatedCoverage.value.map((item) => item.characterId));
  const selectedIds = selectedRelationshipCharacterIds.value;
  return graph.characters.map((node, index) => {
    const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
    const x = 280 + Math.cos(angle) * 205;
    const y = 130 + Math.sin(angle) * 90;
    const active = selectedIds.has(node.id);
    return {
      id: node.id,
      x,
      y,
      radius: active ? 17 : 14,
      shortLabel: shortLabel(node.label),
      active,
      isolated: isolatedIds.has(node.id),
      dimmed: Boolean(selectedRelationshipId.value && !active)
    };
  });
});

const relationCanvasNodeMap = computed(() => new Map(relationCanvasNodes.value.map((node) => [node.id, node])));

const relationCanvasEdges = computed(() =>
  (characterRelations.value?.relationships || []).map((edge) => {
    const source = relationCanvasNodeMap.value.get(edge.sourceCharacterId);
    const target = relationCanvasNodeMap.value.get(edge.targetCharacterId);
    const active = edge.id === selectedRelationshipId.value;
    return {
      id: edge.id,
      x1: source?.x || 0,
      y1: source?.y || 0,
      x2: target?.x || 0,
      y2: target?.y || 0,
      labelX: ((source?.x || 0) + (target?.x || 0)) / 2,
      labelY: ((source?.y || 0) + (target?.y || 0)) / 2 - 4,
      label: edge.label,
      active,
      dimmed: Boolean(selectedRelationshipId.value && !active)
    };
  })
);

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

function selectRelationship(id: string) {
  selectedRelationshipId.value = id;
}

function sourceTypeLabel(sourceType: CharacterRelationshipSourceType) {
  const labels: Record<CharacterRelationshipSourceType, string> = {
    knowledge: "知识",
    event: "事件",
    profile: "档案"
  };
  return labels[sourceType];
}

function coverageHint(item: CharacterRelationshipCoverage) {
  const parts = [
    item.knowledgeTripleCount ? `${item.knowledgeTripleCount} 知识` : "",
    item.eventCount ? `${item.eventCount} 事件` : "",
    item.hasProfileNote ? "有备注" : ""
  ].filter(Boolean);
  return item.isolated ? "缺少关系证据" : parts.join(" · ") || "已有关系";
}
function scheduleStatusLabel(status: CharacterScheduleStatus) {
  const labels: Record<CharacterScheduleStatus, string> = {
    "should-appear": "建议登场",
    overexposed: "近期过曝",
    absent: "缺少证据",
    balanced: "节奏正常"
  };
  return labels[status];
}

function scheduleStatusClass(status: CharacterScheduleStatus) {
  return `status-${status}`;
}

function scheduleSignalHint(item: CharacterAppearanceSignal) {
  const reasons = item.reasons.length ? item.reasons.join(" · ") : scheduleStatusLabel(item.status);
  const lastSeen = item.lastChapterNumber ? `最近第 ${item.lastChapterNumber} 章` : "暂无章节记录";
  return `${reasons} · ${lastSeen} · ${item.appearanceCount} 次`;
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

.character-relations {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

.relation-header,
.relation-badges,
.relation-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.relation-header {
  strong {
    display: block;
    color: var(--app-text-primary);
    font-size: 13px;
  }

  span {
    color: var(--app-text-muted);
    font-size: 11px;
  }
}

.relation-badges {
  flex-wrap: wrap;
  justify-content: flex-end;

  span {
    padding: 4px 7px;
    border: 1px solid var(--app-border);
    border-radius: 999px;
    background: var(--app-bg);
    color: var(--app-text-secondary);
    font-size: 11px;
    white-space: nowrap;
  }
}

.relation-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
  gap: 10px;
  min-width: 0;
}

.relation-canvas {
  min-height: 260px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--app-bg) 88%, var(--app-bg-page));
  overflow: hidden;

  svg {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 260px;
  }

  marker path {
    fill: var(--app-border-strong);
  }
}

.relation-edges {
  line {
    cursor: pointer;
    opacity: 0.68;
    stroke: var(--app-border-strong);
    stroke-width: 1.5;

    &.active {
      opacity: 1;
      stroke: var(--app-primary);
      stroke-width: 2.5;
    }

    &.dimmed {
      opacity: 0.18;
    }
  }

  text {
    fill: var(--app-primary);
    font-size: 10px;
    font-weight: 800;
    paint-order: stroke;
    stroke: var(--app-bg);
    stroke-width: 3px;
    text-anchor: middle;
  }
}

.relation-node {
  circle {
    fill: rgba(20, 184, 166, 0.18);
    stroke: var(--app-success-text);
    stroke-width: 2;
  }

  text {
    fill: var(--app-text-secondary);
    font-size: 10px;
    font-weight: 800;
    pointer-events: none;
    text-anchor: middle;
  }

  &.active circle {
    filter: drop-shadow(0 0 10px rgba(45, 212, 191, 0.5));
    stroke-width: 3;
  }

  &.isolated circle {
    fill: rgba(248, 113, 113, 0.12);
    stroke: var(--app-danger-text);
    stroke-dasharray: 3 3;
  }

  &.dimmed {
    opacity: 0.38;
  }
}

.relation-detail {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}

.relation-card,
.coverage-list,
.appearance-schedule {
  display: grid;
  gap: 7px;
  padding: 9px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
}

.relation-card.selected {
  border-color: color-mix(in srgb, var(--app-primary) 55%, var(--app-border));
}

.relation-title {
  min-width: 0;
  color: var(--app-text-primary);
  font-size: 12px;
  font-weight: 800;

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
  }
}

.evidence-list,
.coverage-list {
  display: grid;
  gap: 6px;
}

.evidence-list div,
.coverage-row,
.schedule-row {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

.evidence-list span,
.coverage-title {
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 800;
}

.evidence-list strong,
.coverage-row span,
.schedule-row span {
  min-width: 0;
  overflow: hidden;
  color: var(--app-text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evidence-list small,
.coverage-row small,
.coverage-row em,
.schedule-row small,
.schedule-row em {
  min-width: 0;
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 11px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coverage-row.isolated {
  border-color: color-mix(in srgb, var(--app-danger-text) 45%, var(--app-border));
}

.schedule-row {
  div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  &.status-should-appear {
    border-color: color-mix(in srgb, var(--app-warning-text) 55%, var(--app-border));
  }

  &.status-overexposed {
    border-color: color-mix(in srgb, var(--app-danger-text) 50%, var(--app-border));
  }

  &.status-absent {
    border-color: color-mix(in srgb, var(--app-text-muted) 60%, var(--app-border));
  }

  &.status-balanced {
    border-color: color-mix(in srgb, var(--app-success-text) 45%, var(--app-border));
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

  .relation-layout {
    grid-template-columns: 1fr;
  }

  .node-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow-x: visible;
  }
}
</style>
