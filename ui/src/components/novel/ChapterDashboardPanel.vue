<template>
  <section class="chapter-dashboard-panel" aria-label="章节写作仪表盘">
    <header>
      <div>
        <div class="panel-title">章节仪表盘</div>
        <p>{{ dashboard?.chapterId || "未载入章节仪表盘" }}</p>
      </div>
      <el-button :disabled="!dashboard || !isDirty" :loading="isSaving" @click="save">
        <el-icon><DocumentChecked /></el-icon>
        保存
      </el-button>
    </header>

    <div v-if="localDashboard" class="dashboard-grid">
      <label>
        <span>章节目标</span>
        <el-input :model-value="localDashboard.goal" @update:model-value="updateTextField('goal', String($event))" />
      </label>
      <label>
        <span>视角</span>
        <el-input :model-value="localDashboard.pov" @update:model-value="updateTextField('pov', String($event))" />
      </label>
      <label>
        <span>主要冲突</span>
        <el-input
          :model-value="localDashboard.mainConflict"
          @update:model-value="updateTextField('mainConflict', String($event))"
        />
      </label>
      <label>
        <span>结尾钩子</span>
        <el-input
          :model-value="localDashboard.endingHook"
          @update:model-value="updateTextField('endingHook', String($event))"
        />
      </label>
      <label>
        <span>状态</span>
        <el-select :model-value="localDashboard.status" @update:model-value="updateStatus(String($event))">
          <el-option v-for="status in statuses" :key="status" :label="statusLabels[status]" :value="status" />
        </el-select>
      </label>

      <div class="metric-row" aria-label="章节仪表盘指标">
        <el-tag type="info">字数 {{ localDashboard.wordCount }}</el-tag>
        <el-tag type="warning">伏笔 {{ localDashboard.unresolvedForeshadowingIds.length }}</el-tag>
        <el-tag type="danger">风险 {{ localDashboard.continuityRiskIds.length }}</el-tag>
      </div>
    </div>

    <p v-else class="empty-state">未载入章节仪表盘。</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { DocumentChecked } from "@element-plus/icons-vue";
import type { ChapterDashboard } from "@/types/novel";

const props = defineProps<{
  dashboard: ChapterDashboard | null;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  "update:dashboard": [dashboard: ChapterDashboard];
  save: [];
}>();

const statuses: ChapterDashboard["status"][] = ["empty", "planned", "drafting", "drafted", "reviewing", "checked"];
const statusLabels: Record<ChapterDashboard["status"], string> = {
  empty: "未开始",
  planned: "已规划",
  drafting: "写作中",
  drafted: "已起草",
  reviewing: "审稿中",
  checked: "已检查"
};
const localDashboard = ref<ChapterDashboard | null>(props.dashboard ? { ...props.dashboard } : null);
const isDirty = ref(false);

watch(
  () => props.dashboard?.chapterId,
  () => {
    localDashboard.value = props.dashboard ? { ...props.dashboard } : null;
    isDirty.value = false;
  }
);

watch(
  () => props.dashboard?.wordCount,
  () => {
    if (!localDashboard.value || !props.dashboard) return;
    localDashboard.value = {
      ...localDashboard.value,
      wordCount: props.dashboard.wordCount
    };
  }
);

function updateDashboard(nextDashboard: ChapterDashboard) {
  localDashboard.value = nextDashboard;
  isDirty.value = true;
  emit("update:dashboard", nextDashboard);
}

function updateTextField(key: "goal" | "pov" | "mainConflict" | "endingHook", value: string) {
  if (!localDashboard.value) return;
  updateDashboard({
    ...localDashboard.value,
    [key]: value,
    updatedAt: new Date().toISOString()
  });
}

function updateStatus(value: string) {
  if (!localDashboard.value || !statuses.includes(value as ChapterDashboard["status"])) return;
  updateDashboard({
    ...localDashboard.value,
    status: value as ChapterDashboard["status"],
    updatedAt: new Date().toISOString()
  });
}

function save() {
  if (!localDashboard.value || !isDirty.value) return;
  isDirty.value = false;
  emit("save");
}
</script>

<style scoped lang="scss">
.chapter-dashboard-panel {
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
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

.metric-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  grid-column: 1 / -1;
}

.empty-state {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 760px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
</style>
