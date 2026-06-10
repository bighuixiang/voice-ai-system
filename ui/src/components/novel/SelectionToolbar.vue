<template>
  <section class="selection-toolbar" aria-label="选区操作">
    <div class="toolbar-title">
      <span>选区润色</span>
      <small>{{ selectedLength }} 字</small>
    </div>
    <div class="mode-grid">
      <el-button
        v-for="mode in modes"
        :key="mode.value"
        class="mode-button"
        :disabled="!enabled || loading"
        size="small"
        @click="$emit('polish', mode.value)"
      >
        <el-icon><component :is="mode.icon" /></el-icon>
        {{ mode.label }}
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { EditPen, Fold, MagicStick, Reading, TrendCharts, Warning } from "@element-plus/icons-vue";
import type { EditorSelection } from "@/types/novel";

const props = defineProps<{
  selection: EditorSelection | null;
  loading: boolean;
}>();

defineEmits<{
  polish: [mode: string];
}>();

const enabled = computed(() => Boolean(props.selection?.selectedText));
const selectedLength = computed(() => props.selection?.selectedText.length || 0);
const modes = [
  { value: "polish", label: "润色", icon: EditPen },
  { value: "expand", label: "扩写", icon: MagicStick },
  { value: "compress", label: "压缩", icon: Fold },
  { value: "reduce-exaggeration", label: "降浮夸", icon: Warning },
  { value: "strengthen-tension", label: "压迫感", icon: TrendCharts },
  { value: "pov-check", label: "POV", icon: Reading }
];
</script>

<style scoped lang="scss">
.selection-toolbar {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.toolbar-title {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--app-text-primary);
  font-weight: 700;

  small {
    color: var(--app-text-muted);
    font-weight: 500;
  }
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 20px;

  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}

.mode-button {
  width: 100%;
  min-width: 0;
  justify-content: center;
}
</style>
