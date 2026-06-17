<template>
  <section class="story-control-panel" aria-label="故事总控台">
    <header class="control-header">
      <div>
        <div class="panel-title">故事总控台</div>
        <p>{{ summaryText }}</p>
      </div>
      <div class="panel-actions">
        <el-button aria-label="AI 编排未来章节" :disabled="!canGenerate" :loading="isGenerating" @click="$emit('orchestrate')">
          <el-icon><MagicStick /></el-icon>
          AI 编排
        </el-button>
        <el-button aria-label="保存故事总控台" :disabled="!isDirty" :loading="isSaving" @click="save">
          <el-icon><DocumentChecked /></el-icon>
          保存
        </el-button>
      </div>
    </header>

    <div v-if="localStoryControl" class="control-body">
      <section class="global-brief" aria-label="全局设定">
        <label>
          <span>整本前提</span>
          <el-input
            :model-value="localStoryControl.premise"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="一句话写清主角、长期目标、核心矛盾和升级方向。"
            @update:model-value="updateRoot('premise', String($event))"
          />
        </label>
        <label>
          <span>编排规则</span>
          <el-input
            :model-value="localStoryControl.orchestrationNotes"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="写清 AI 编排未来章节时必须遵守的升级、组队、代价和伏笔规则。"
            @update:model-value="updateRoot('orchestrationNotes', String($event))"
          />
        </label>
      </section>

      <div class="control-browser">
        <aside class="index-pane" aria-label="总控索引">
          <nav class="section-tabs" aria-label="总控分区">
            <button
              v-for="section in sections"
              :key="section.key"
              type="button"
              :class="{ active: activeSection === section.key }"
              :aria-pressed="activeSection === section.key"
              @click="selectSection(section.key)"
            >
              <span>{{ section.label }}</span>
              <strong>{{ section.count }}</strong>
            </button>
          </nav>

          <div class="index-tools">
            <el-input :model-value="searchText" :placeholder="searchPlaceholder" clearable @update:model-value="searchText = String($event)" />
            <el-button :aria-label="addButtonLabel" @click="addActiveItem">
              <el-icon><Plus /></el-icon>
            </el-button>
          </div>

          <div v-if="activeSection === 'arcs'" class="index-list" role="list">
            <button
              v-for="arc in filteredArcs"
              :key="arc.id"
              type="button"
              role="listitem"
              :class="{ selected: selectedArcId === arc.id }"
              @click="selectedArcId = arc.id"
            >
              <span class="item-main">
                <strong>{{ arc.title || "未命名阶段" }}</strong>
                <small>{{ arc.chapterRange || "未设章节" }}</small>
              </span>
              <span class="item-meta">
                <em v-if="localStoryControl.currentArcId === arc.id">当前</em>
                {{ statusLabels[arc.status] }}
              </span>
            </button>
            <p v-if="!filteredArcs.length" class="empty-inline">没有匹配的阶段。</p>
          </div>

          <div v-if="activeSection === 'characters'" class="index-list" role="list">
            <button
              v-for="character in filteredCharacters"
              :key="character.id"
              type="button"
              role="listitem"
              :class="{ selected: selectedCharacterId === character.id }"
              @click="selectedCharacterId = character.id"
            >
              <span class="item-main">
                <strong>{{ character.name || "未命名角色" }}</strong>
                <small>{{ character.role || "未设身份" }}</small>
              </span>
              <span class="item-meta">{{ character.powerLevel || statusLabels[character.status] }}</span>
            </button>
            <p v-if="!filteredCharacters.length" class="empty-inline">没有匹配的角色。</p>
          </div>

          <div v-if="activeSection === 'events'" class="index-list" role="list">
            <button
              v-for="event in filteredEvents"
              :key="event.id"
              type="button"
              role="listitem"
              :class="{ selected: selectedEventId === event.id }"
              @click="selectedEventId = event.id"
            >
              <span class="item-main">
                <strong>{{ event.title || "未命名事件" }}</strong>
                <small>{{ event.chapterRange || event.location || "待安排" }}</small>
              </span>
              <span class="item-meta">{{ eventTypeLabels[event.type] }}</span>
            </button>
            <p v-if="!filteredEvents.length" class="empty-inline">没有匹配的事件。</p>
          </div>
        </aside>

        <section v-if="activeSection === 'arcs'" class="detail-pane" aria-label="阶段详情">
          <template v-if="selectedArc">
            <div class="detail-header">
              <div>
                <span class="detail-kicker">全书阶段</span>
                <h3>{{ selectedArc.title || "未命名阶段" }}</h3>
              </div>
              <div class="detail-actions">
                <el-button :disabled="localStoryControl.currentArcId === selectedArc.id" @click="markCurrentArc(selectedArc.id)">
                  设为当前
                </el-button>
                <el-button aria-label="删除阶段" @click="removeArc(selectedArc.id)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
            <div class="detail-grid">
              <label>
                <span>标题</span>
                <el-input :model-value="selectedArc.title" @update:model-value="updateArc(selectedArc.id, 'title', String($event))" />
              </label>
              <label>
                <span>章节区间</span>
                <el-input
                  :model-value="selectedArc.chapterRange"
                  placeholder="例：第 1-30 章"
                  @update:model-value="updateArc(selectedArc.id, 'chapterRange', String($event))"
                />
              </label>
              <label>
                <span>状态</span>
                <el-select :model-value="selectedArc.status" @update:model-value="updateArc(selectedArc.id, 'status', String($event))">
                  <el-option v-for="status in statuses" :key="status" :label="statusLabels[status]" :value="status" />
                </el-select>
              </label>
              <label class="wide-field">
                <span>阶段目标</span>
                <el-input
                  :model-value="selectedArc.goal"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateArc(selectedArc.id, 'goal', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>代价/风险</span>
                <el-input
                  :model-value="selectedArc.stakes"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateArc(selectedArc.id, 'stakes', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>回报/回收</span>
                <el-input
                  :model-value="selectedArc.payoff"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateArc(selectedArc.id, 'payoff', String($event))"
                />
              </label>
            </div>
          </template>
          <p v-else class="empty-state">左侧新增或选择一个阶段。</p>
        </section>

        <section v-if="activeSection === 'characters'" class="detail-pane" aria-label="角色详情">
          <template v-if="selectedCharacter">
            <div class="detail-header">
              <div>
                <span class="detail-kicker">角色档案</span>
                <h3>{{ selectedCharacter.name || "未命名角色" }}</h3>
              </div>
              <el-button aria-label="删除角色" @click="removeCharacter(selectedCharacter.id)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <div class="detail-grid">
              <label>
                <span>姓名</span>
                <el-input :model-value="selectedCharacter.name" @update:model-value="updateCharacter(selectedCharacter.id, 'name', String($event))" />
              </label>
              <label>
                <span>身份</span>
                <el-input :model-value="selectedCharacter.role" @update:model-value="updateCharacter(selectedCharacter.id, 'role', String($event))" />
              </label>
              <label>
                <span>状态</span>
                <el-select
                  :model-value="selectedCharacter.status"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'status', String($event))"
                >
                  <el-option v-for="status in statuses" :key="status" :label="statusLabels[status]" :value="status" />
                </el-select>
              </label>
              <label>
                <span>战力/资源</span>
                <el-input
                  :model-value="selectedCharacter.powerLevel"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'powerLevel', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>目标</span>
                <el-input
                  :model-value="selectedCharacter.goal"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'goal', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>Core wound</span>
                <el-input
                  :model-value="selectedCharacter.coreWound || ''"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'coreWound', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>Desire</span>
                <el-input
                  :model-value="selectedCharacter.desire || ''"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'desire', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>Misbelief</span>
                <el-input
                  :model-value="selectedCharacter.misbelief || ''"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'misbelief', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>当前状态</span>
                <el-input
                  :model-value="selectedCharacter.currentState"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'currentState', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>已知秘密</span>
                <el-input
                  :model-value="selectedCharacter.knownSecrets"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'knownSecrets', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>关系备注</span>
                <el-input
                  :model-value="selectedCharacter.relationshipNotes"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'relationshipNotes', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>Redemption arc</span>
                <el-input
                  :model-value="selectedCharacter.redemptionArc || ''"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'redemptionArc', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>Sublimation goal</span>
                <el-input
                  :model-value="selectedCharacter.sublimationGoal || ''"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'sublimationGoal', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>Small-person highlight</span>
                <el-input
                  :model-value="selectedCharacter.smallPersonHighlight || ''"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'smallPersonHighlight', String($event))"
                />
              </label>
              <label>
                <span>Relationship pressure</span>
                <el-input
                  :model-value="selectedCharacter.relationshipPressure || ''"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'relationshipPressure', String($event))"
                />
              </label>
              <label>
                <span>Growth stage</span>
                <el-input
                  :model-value="selectedCharacter.growthStage || ''"
                  @update:model-value="updateCharacter(selectedCharacter.id, 'growthStage', String($event))"
                />
              </label>
            </div>
          </template>
          <p v-else class="empty-state">左侧新增或选择一个角色。</p>
        </section>

        <section v-if="activeSection === 'events'" class="detail-pane" aria-label="事件详情">
          <template v-if="selectedEvent">
            <div class="detail-header">
              <div>
                <span class="detail-kicker">{{ eventTypeLabels[selectedEvent.type] }}</span>
                <h3>{{ selectedEvent.title || "未命名事件" }}</h3>
              </div>
              <el-button aria-label="删除事件" @click="removeEvent(selectedEvent.id)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <div class="detail-grid">
              <label>
                <span>类型</span>
                <el-select :model-value="selectedEvent.type" @update:model-value="updateEvent(selectedEvent.id, 'type', String($event))">
                  <el-option v-for="type in eventTypes" :key="type" :label="eventTypeLabels[type]" :value="type" />
                </el-select>
              </label>
              <label>
                <span>标题</span>
                <el-input :model-value="selectedEvent.title" @update:model-value="updateEvent(selectedEvent.id, 'title', String($event))" />
              </label>
              <label>
                <span>状态</span>
                <el-select :model-value="selectedEvent.status" @update:model-value="updateEvent(selectedEvent.id, 'status', String($event))">
                  <el-option v-for="status in statuses" :key="status" :label="statusLabels[status]" :value="status" />
                </el-select>
              </label>
              <label>
                <span>章节区间</span>
                <el-input :model-value="selectedEvent.chapterRange" @update:model-value="updateEvent(selectedEvent.id, 'chapterRange', String($event))" />
              </label>
              <label>
                <span>地点</span>
                <el-input :model-value="selectedEvent.location" @update:model-value="updateEvent(selectedEvent.id, 'location', String($event))" />
              </label>
              <label>
                <span>参与角色</span>
                <el-input
                  :model-value="selectedEvent.participants.join('、')"
                  placeholder="用顿号或逗号分隔"
                  @update:model-value="updateEventParticipants(selectedEvent.id, String($event))"
                />
              </label>
              <label class="wide-field">
                <span>触发条件</span>
                <el-input
                  :model-value="selectedEvent.trigger"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateEvent(selectedEvent.id, 'trigger', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>冲突</span>
                <el-input
                  :model-value="selectedEvent.conflict"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateEvent(selectedEvent.id, 'conflict', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>收益</span>
                <el-input
                  :model-value="selectedEvent.reward"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateEvent(selectedEvent.id, 'reward', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>代价</span>
                <el-input
                  :model-value="selectedEvent.cost"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateEvent(selectedEvent.id, 'cost', String($event))"
                />
              </label>
              <label class="wide-field">
                <span>伏笔</span>
                <el-input
                  :model-value="selectedEvent.foreshadowing"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  @update:model-value="updateEvent(selectedEvent.id, 'foreshadowing', String($event))"
                />
              </label>
            </div>
          </template>
          <p v-else class="empty-state">左侧新增或选择一个事件。</p>
        </section>
      </div>
    </div>

    <p v-else class="empty-state">正在载入故事总控台。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Delete, DocumentChecked, MagicStick, Plus } from "@element-plus/icons-vue";
import type {
  StoryArc,
  StoryCharacterProfile,
  StoryControl,
  StoryControlStatus,
  StoryEventCard,
  StoryEventType
} from "@/types/novel";

type SectionKey = "arcs" | "characters" | "events";

const props = defineProps<{
  storyControl: StoryControl | null;
  isSaving?: boolean;
  isGenerating?: boolean;
  canGenerate?: boolean;
}>();

const emit = defineEmits<{
  "update:story-control": [storyControl: StoryControl];
  save: [];
  orchestrate: [];
}>();

const statuses: StoryControlStatus[] = ["seed", "planned", "active", "resolved", "blocked"];
const statusLabels: Record<StoryControlStatus, string> = {
  seed: "种子",
  planned: "已计划",
  active: "进行中",
  resolved: "已解决",
  blocked: "卡住"
};
const eventTypes: StoryEventType[] = ["event", "dungeon", "team-fight", "training", "reveal"];
const eventTypeLabels: Record<StoryEventType, string> = {
  event: "事件",
  dungeon: "秘境",
  "team-fight": "团战",
  training: "修炼",
  reveal: "揭示"
};

const localStoryControl = ref<StoryControl | null>(cloneStoryControl(props.storyControl));
const isDirty = ref(false);
const activeSection = ref<SectionKey>("arcs");
const searchText = ref("");
const selectedArcId = ref(localStoryControl.value?.currentArcId || localStoryControl.value?.arcs[0]?.id || "");
const selectedCharacterId = ref(localStoryControl.value?.characters[0]?.id || "");
const selectedEventId = ref(localStoryControl.value?.events[0]?.id || "");

const summaryText = computed(() => {
  if (!localStoryControl.value) return "项目级大纲、角色和事件池";
  return `${localStoryControl.value.arcs.length} 阶段 / ${localStoryControl.value.characters.length} 角色 / ${localStoryControl.value.events.length} 事件`;
});

const sections = computed(() => [
  { key: "arcs" as const, label: "全书阶段", count: localStoryControl.value?.arcs.length || 0 },
  { key: "characters" as const, label: "角色", count: localStoryControl.value?.characters.length || 0 },
  { key: "events" as const, label: "事件池", count: localStoryControl.value?.events.length || 0 }
]);

const searchPlaceholder = computed(() => {
  if (activeSection.value === "arcs") return "搜索阶段、章节、目标";
  if (activeSection.value === "characters") return "搜索角色、身份、目标";
  return "搜索事件、地点、触发、角色";
});

const addButtonLabel = computed(() => {
  if (activeSection.value === "arcs") return "新增阶段";
  if (activeSection.value === "characters") return "新增角色";
  return "新增事件";
});

const filteredArcs = computed(() => {
  const keyword = normalize(searchText.value);
  return (localStoryControl.value?.arcs || []).filter((arc) =>
    includesKeyword([arc.title, arc.chapterRange, arc.goal, arc.stakes, arc.payoff, arc.status], keyword)
  );
});

const filteredCharacters = computed(() => {
  const keyword = normalize(searchText.value);
  return (localStoryControl.value?.characters || []).filter((character) =>
    includesKeyword(
      [
        character.name,
        character.role,
        character.goal,
        character.currentState,
        character.knownSecrets,
        character.relationshipNotes,
        character.powerLevel,
        character.status
      ],
      keyword
    )
  );
});

const filteredEvents = computed(() => {
  const keyword = normalize(searchText.value);
  return (localStoryControl.value?.events || []).filter((event) =>
    includesKeyword(
      [
        eventTypeLabels[event.type],
        event.title,
        event.trigger,
        event.participants.join(" "),
        event.location,
        event.conflict,
        event.reward,
        event.cost,
        event.foreshadowing,
        event.chapterRange,
        event.status
      ],
      keyword
    )
  );
});

const selectedArc = computed(() => localStoryControl.value?.arcs.find((arc) => arc.id === selectedArcId.value) || null);
const selectedCharacter = computed(
  () => localStoryControl.value?.characters.find((character) => character.id === selectedCharacterId.value) || null
);
const selectedEvent = computed(() => localStoryControl.value?.events.find((event) => event.id === selectedEventId.value) || null);

watch(
  () => props.storyControl,
  (storyControl) => {
    if (isDirty.value) return;
    localStoryControl.value = cloneStoryControl(storyControl);
    syncSelection();
  },
  { deep: true }
);

watch(localStoryControl, () => {
  syncSelection();
});

function cloneStoryControl(storyControl: StoryControl | null) {
  return storyControl ? JSON.parse(JSON.stringify(storyControl)) as StoryControl : null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesKeyword(values: Array<string | undefined>, keyword: string) {
  if (!keyword) return true;
  return values.some((value) => normalize(value || "").includes(keyword));
}

function splitNames(value: string) {
  return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function syncSelection() {
  const storyControl = localStoryControl.value;
  if (!storyControl) return;
  if (!storyControl.arcs.some((arc) => arc.id === selectedArcId.value)) {
    selectedArcId.value = storyControl.currentArcId || storyControl.arcs[0]?.id || "";
  }
  if (!storyControl.characters.some((character) => character.id === selectedCharacterId.value)) {
    selectedCharacterId.value = storyControl.characters[0]?.id || "";
  }
  if (!storyControl.events.some((event) => event.id === selectedEventId.value)) {
    selectedEventId.value = storyControl.events[0]?.id || "";
  }
}

function commit(nextStoryControl: StoryControl) {
  localStoryControl.value = {
    ...nextStoryControl,
    version: 1,
    updatedAt: nowIso()
  };
  isDirty.value = true;
  emit("update:story-control", localStoryControl.value);
}

function selectSection(section: SectionKey) {
  activeSection.value = section;
  searchText.value = "";
  syncSelection();
}

function addActiveItem() {
  if (activeSection.value === "arcs") {
    addArc();
    return;
  }
  if (activeSection.value === "characters") {
    addCharacter();
    return;
  }
  addEvent();
}

function updateRoot(key: "premise" | "orchestrationNotes", value: string) {
  if (!localStoryControl.value) return;
  commit({ ...localStoryControl.value, [key]: value });
}

function makeArc(): StoryArc {
  const order = (localStoryControl.value?.arcs.length || 0) + 1;
  return {
    id: `arc-${Date.now()}-${order}`,
    title: `阶段 ${order}`,
    chapterRange: "",
    goal: "",
    stakes: "",
    payoff: "",
    status: "planned",
    updatedAt: nowIso()
  };
}

function addArc() {
  if (!localStoryControl.value) return;
  const arc = makeArc();
  selectedArcId.value = arc.id;
  commit({ ...localStoryControl.value, arcs: [...localStoryControl.value.arcs, arc] });
}

function updateArc(id: string, key: keyof StoryArc, value: string) {
  if (!localStoryControl.value) return;
  commit({
    ...localStoryControl.value,
    arcs: localStoryControl.value.arcs.map((arc) => (arc.id === id ? { ...arc, [key]: value, updatedAt: nowIso() } : arc))
  });
}

function markCurrentArc(id: string) {
  if (!localStoryControl.value) return;
  commit({ ...localStoryControl.value, currentArcId: id });
}

function removeArc(id: string) {
  if (!localStoryControl.value) return;
  const arcs = localStoryControl.value.arcs.filter((arc) => arc.id !== id);
  const currentArcId = localStoryControl.value.currentArcId === id ? arcs[0]?.id : localStoryControl.value.currentArcId;
  selectedArcId.value = currentArcId || arcs[0]?.id || "";
  commit({ ...localStoryControl.value, arcs, currentArcId });
}

function makeCharacter(): StoryCharacterProfile {
  const order = (localStoryControl.value?.characters.length || 0) + 1;
  return {
    id: `char-${Date.now()}-${order}`,
    name: `角色 ${order}`,
    role: "",
    goal: "",
    currentState: "",
    knownSecrets: "",
    relationshipNotes: "",
    powerLevel: "",
    signatureTraits: [],
    coreWound: "",
    desire: "",
    misbelief: "",
    redemptionArc: "",
    sublimationGoal: "",
    smallPersonHighlight: "",
    relationshipPressure: "",
    growthStage: "",
    status: "planned",
    updatedAt: nowIso()
  };
}

function addCharacter() {
  if (!localStoryControl.value) return;
  const character = makeCharacter();
  selectedCharacterId.value = character.id;
  commit({ ...localStoryControl.value, characters: [...localStoryControl.value.characters, character] });
}

function updateCharacter(id: string, key: keyof StoryCharacterProfile, value: string) {
  if (!localStoryControl.value) return;
  commit({
    ...localStoryControl.value,
    characters: localStoryControl.value.characters.map((character) =>
      character.id === id ? { ...character, [key]: value, updatedAt: nowIso() } : character
    )
  });
}

function removeCharacter(id: string) {
  if (!localStoryControl.value) return;
  const characters = localStoryControl.value.characters.filter((character) => character.id !== id);
  selectedCharacterId.value = characters[0]?.id || "";
  commit({ ...localStoryControl.value, characters });
}

function makeEvent(): StoryEventCard {
  const order = (localStoryControl.value?.events.length || 0) + 1;
  return {
    id: `event-${Date.now()}-${order}`,
    type: "event",
    title: `事件 ${order}`,
    trigger: "",
    participants: [],
    location: "",
    conflict: "",
    reward: "",
    cost: "",
    foreshadowing: "",
    chapterRange: "",
    status: "planned",
    updatedAt: nowIso()
  };
}

function addEvent() {
  if (!localStoryControl.value) return;
  const event = makeEvent();
  selectedEventId.value = event.id;
  commit({ ...localStoryControl.value, events: [...localStoryControl.value.events, event] });
}

function updateEvent(id: string, key: keyof StoryEventCard, value: string) {
  if (!localStoryControl.value) return;
  commit({
    ...localStoryControl.value,
    events: localStoryControl.value.events.map((event) =>
      event.id === id ? { ...event, [key]: value, updatedAt: nowIso() } : event
    )
  });
}

function updateEventParticipants(id: string, value: string) {
  if (!localStoryControl.value) return;
  commit({
    ...localStoryControl.value,
    events: localStoryControl.value.events.map((event) =>
      event.id === id ? { ...event, participants: splitNames(value), updatedAt: nowIso() } : event
    )
  });
}

function removeEvent(id: string) {
  if (!localStoryControl.value) return;
  const events = localStoryControl.value.events.filter((event) => event.id !== id);
  selectedEventId.value = events[0]?.id || "";
  commit({ ...localStoryControl.value, events });
}

function save() {
  if (!isDirty.value) return;
  isDirty.value = false;
  emit("save");
}
</script>

<style scoped lang="scss">
.story-control-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: min(700px, 76vh);
  min-height: 560px;
  max-height: calc(100vh - 180px);
  color: var(--app-text-primary);
  background: var(--app-bg-soft);
}

.control-header,
.panel-actions,
.detail-header,
.detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-header,
.detail-header {
  justify-content: space-between;
}

.control-header {
  flex-wrap: wrap;
  padding: 2px 2px 0;

  p {
    margin: 4px 0 0;
    color: var(--app-text-muted);
    font-size: 12px;
  }
}

.panel-title {
  color: var(--app-text-primary);
  font-size: 15px;
  font-weight: 800;
}

.panel-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.panel-actions :deep(.el-button) {
  border-radius: 6px;
}

.control-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}

.global-brief {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-primary) 8%, transparent), transparent 70%),
    var(--app-bg);
}

.global-brief label,
.detail-grid label {
  display: flex;
  flex-direction: column;
  gap: 5px;

  span {
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
  }
}

.story-control-panel :deep(.el-input__wrapper),
.story-control-panel :deep(.el-textarea__inner),
.story-control-panel :deep(.el-select__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px var(--app-border) inset;
}

.story-control-panel :deep(.el-textarea__inner) {
  max-height: 96px;
  line-height: 1.5;
  resize: vertical;
}

.story-control-panel :deep(.el-input__wrapper:hover),
.story-control-panel :deep(.el-textarea__inner:hover),
.story-control-panel :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--app-border-soft) inset;
}

.control-browser {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: minmax(312px, 26%) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.index-pane {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid var(--app-border);
  padding: 10px;
  background: var(--app-bg-soft);
}

.section-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);

  button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-width: 0;
    min-height: 34px;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--app-text-secondary);
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;

    span,
    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      font-size: 12px;
      font-weight: 700;
    }

    strong {
      display: inline-flex;
      min-width: 22px;
      height: 20px;
      justify-content: center;
      align-items: center;
      border-radius: 7px;
      background: var(--app-bg-muted);
      color: var(--app-text-primary);
      font-size: 12px;
    }
  }

  button:hover,
  button.active {
    border-color: color-mix(in srgb, var(--app-primary) 42%, var(--app-border));
    background: var(--app-primary-soft);
    color: var(--app-primary-text);
  }

  button.active {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-primary) 34%, transparent) inset;
  }

  button.active strong {
    background: var(--app-primary-soft);
    color: var(--app-primary-text);
  }
}

.index-tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  gap: 8px;
}

.index-tools :deep(.el-button) {
  width: 36px;
  padding: 0;
  border-radius: 6px;
}

.index-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  overflow: auto;
  padding: 2px 2px 2px 0;

  button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 46px;
    padding: 7px 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--app-text-primary);
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }

  button:hover,
  button.selected {
    border-color: color-mix(in srgb, var(--app-primary) 42%, var(--app-border));
    background: var(--app-bg);
  }

  button.selected {
    box-shadow: inset 3px 0 0 var(--app-primary), 0 0 0 1px color-mix(in srgb, var(--app-primary) 24%, transparent) inset;
  }
}

.item-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 13px;
    line-height: 1.35;
  }

  small {
    color: var(--app-text-muted);
    font-size: 12px;
  }
}

.item-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1.35;

  em {
    color: var(--app-primary);
    font-style: normal;
    font-weight: 700;
  }
}

.detail-pane {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px 18px;
  background: var(--app-bg);
}

.detail-header {
  align-items: flex-start;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--app-border);

  h3 {
    margin: 3px 0 0;
    color: var(--app-text-primary);
    font-size: 18px;
    line-height: 1.3;
  }
}

.detail-kicker {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
  align-items: start;
}

.wide-field {
  grid-column: auto;
}

.wide-field :deep(.el-textarea__inner) {
  min-height: 72px !important;
}

.empty-state,
.empty-inline {
  margin: 0;
  color: var(--app-text-muted);
}

.empty-state {
  padding: 28px;
  text-align: center;
}

.empty-inline {
  padding: 12px 4px;
  font-size: 13px;
}

@media (max-width: 820px) {
  .story-control-panel {
    min-height: auto;
  }

  .control-header,
  .panel-actions,
  .detail-header {
    align-items: stretch;
  }

  .global-brief,
  .control-browser,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .section-tabs {
    grid-template-columns: 1fr;
  }

  .wide-field {
    grid-column: 1 / -1;
  }

  .control-browser {
    overflow: visible;
  }

  .index-pane {
    border-right: 0;
    border-bottom: 1px solid var(--app-border);
  }

  .index-list {
    max-height: 260px;
  }
}
</style>
