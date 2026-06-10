<template>
  <section class="writing-mode-switcher" aria-label="写作模式">
    <WorkbenchSegmentedControl
      :model-value="mode"
      :options="modeOptions"
      ariaLabel="写作模式"
      compact
      @update:model-value="updateMode"
    />
  </section>
</template>

<script setup lang="ts">
import { DataAnalysis, Edit, Finished } from "@element-plus/icons-vue";
import WorkbenchSegmentedControl from "@/components/common/WorkbenchSegmentedControl.vue";
import type { WritingMode } from "@/types/novel";

defineProps<{
  mode: WritingMode;
}>();

const emit = defineEmits<{
  "update:mode": [mode: WritingMode];
}>();

const modeOptions = [
  {
    value: "focus",
    label: "专注",
    description: "正文优先",
    icon: Edit,
    tone: "blue" as const
  },
  {
    value: "structure",
    label: "结构",
    description: "仪表盘与场景",
    icon: DataAnalysis,
    tone: "emerald" as const
  },
  {
    value: "review",
    label: "审稿",
    description: "改写与账本",
    icon: Finished,
    tone: "slate" as const
  }
];

function updateMode(value: string) {
  emit("update:mode", value as WritingMode);
}
</script>

<style scoped lang="scss">
.writing-mode-switcher {
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}
</style>
