<template>
  <section class="scene-card-panel" aria-label="场景卡">
    <header>
      <div>
        <div class="panel-title">场景卡</div>
        <p>{{ localCards.length }} 个场景</p>
      </div>
      <div class="scene-actions">
        <el-button aria-label="新增场景" @click="addScene">
          <el-icon><Plus /></el-icon>
        </el-button>
        <el-button aria-label="保存场景卡" :disabled="!isDirty" :loading="isSaving" @click="save">
          <el-icon><DocumentChecked /></el-icon>
        </el-button>
      </div>
    </header>

    <ol v-if="localCards.length" class="scene-list">
      <li v-for="(card, index) in localCards" :key="card.id" class="scene-item">
        <div class="scene-item-header">
          <strong>场景 {{ index + 1 }}</strong>
          <div class="item-actions">
            <el-button aria-label="上移场景" :disabled="index === 0" @click="moveScene(index, -1)">
              <el-icon><ArrowUp /></el-icon>
            </el-button>
            <el-button aria-label="下移场景" :disabled="index === localCards.length - 1" @click="moveScene(index, 1)">
              <el-icon><ArrowDown /></el-icon>
            </el-button>
            <el-button aria-label="删除场景" @click="deleteScene(index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>

        <div class="scene-fields">
          <label>
            <span>标题</span>
            <el-input :model-value="card.title" @update:model-value="updateScene(index, 'title', String($event))" />
          </label>
          <label>
            <span>地点</span>
            <el-input :model-value="card.location" @update:model-value="updateScene(index, 'location', String($event))" />
          </label>
          <label>
            <span>视角</span>
            <el-input :model-value="card.pov" @update:model-value="updateScene(index, 'pov', String($event))" />
          </label>
          <label>
            <span>冲突</span>
            <el-input :model-value="card.conflict" @update:model-value="updateScene(index, 'conflict', String($event))" />
          </label>
          <label>
            <span>转折</span>
            <el-input :model-value="card.turn" @update:model-value="updateScene(index, 'turn', String($event))" />
          </label>
          <label>
            <span>能力推进</span>
            <el-input
              :model-value="card.powerProgression"
              @update:model-value="updateScene(index, 'powerProgression', String($event))"
            />
          </label>
        </div>
      </li>
    </ol>

    <p v-else class="empty-state">暂无场景。</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ArrowDown, ArrowUp, Delete, DocumentChecked, Plus } from "@element-plus/icons-vue";
import type { SceneCard } from "@/types/novel";

const props = defineProps<{
  cards: SceneCard[];
  isSaving?: boolean;
  revision?: number;
  confirmDelete?: (card: SceneCard) => boolean;
}>();

const emit = defineEmits<{
  "update:cards": [cards: SceneCard[]];
  save: [];
}>();

const localCards = ref<SceneCard[]>(normalizeCards(props.cards, true));
const isDirty = ref(false);

watch(
  () => props.cards,
  (cards) => {
    if (isDirty.value) return;
    localCards.value = normalizeCards(cards, true);
  },
  { deep: true }
);

watch(
  () => props.revision,
  () => {
    localCards.value = normalizeCards(props.cards, true);
    isDirty.value = false;
  }
);

function normalizeCards(cards: SceneCard[], sortByOrder = false) {
  const orderedCards = sortByOrder ? [...cards].sort((left, right) => left.order - right.order) : [...cards];
  return orderedCards.map((card, index) => ({ ...card, order: index + 1 }));
}

function defaultChapterId() {
  return localCards.value[0]?.chapterId || "chapter-001";
}

function makeScene(): SceneCard {
  const order = localCards.value.length + 1;
  return {
    id: `scene-${Date.now()}-${order}`,
    chapterId: defaultChapterId(),
    order,
    title: "",
    time: "",
    location: "",
    pov: "",
    characters: [],
    conflict: "",
    turn: "",
    informationReleased: [],
    foreshadowingIds: [],
    powerProgression: "",
    updatedAt: new Date().toISOString()
  };
}

function commit(cards: SceneCard[]) {
  localCards.value = normalizeCards(cards);
  isDirty.value = true;
  emit("update:cards", localCards.value);
}

function addScene() {
  commit([...localCards.value, makeScene()]);
}

function updateScene(index: number, key: "title" | "location" | "pov" | "conflict" | "turn" | "powerProgression", value: string) {
  commit(
    localCards.value.map((card, cardIndex) =>
      cardIndex === index
        ? {
            ...card,
            [key]: value,
            updatedAt: new Date().toISOString()
          }
        : card
    )
  );
}

function moveScene(index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= localCards.value.length) return;
  const nextCards = [...localCards.value];
  const [card] = nextCards.splice(index, 1);
  nextCards.splice(targetIndex, 0, card);
  commit(nextCards);
}

function deleteScene(index: number) {
  const card = localCards.value[index];
  if (!card) return;
  if (props.confirmDelete && !props.confirmDelete(card)) return;
  commit(localCards.value.filter((_, cardIndex) => cardIndex !== index));
}

function save() {
  if (!isDirty.value) return;
  isDirty.value = false;
  emit("save");
}
</script>

<style scoped lang="scss">
.scene-card-panel {
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

header,
.scene-item-header,
.scene-actions,
.item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

header,
.scene-item-header {
  justify-content: space-between;
}

header {
  margin-bottom: 10px;

  p {
    margin: 3px 0 0;
    color: #64748b;
    font-size: 12px;
  }
}

.panel-title {
  font-weight: 700;
}

.scene-list {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.scene-item {
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  background: #fbfcfe;
}

.scene-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

label {
  display: grid;
  gap: 5px;
  min-width: 0;

  span {
    color: #475569;
    font-size: 12px;
    font-weight: 700;
  }
}

.empty-state {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 760px) {
  .scene-fields {
    grid-template-columns: 1fr;
  }
}
</style>
