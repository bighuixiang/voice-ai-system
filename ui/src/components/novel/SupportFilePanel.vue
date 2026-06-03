<template>
  <section class="support-file-panel" aria-label="资料与账本">
    <header>
      <div>
        <div class="panel-title">资料与账本</div>
        <p>{{ currentPath }}</p>
      </div>
      <el-button :disabled="!currentPath || !hasUnsavedChanges" @click="$emit('save')">
        <el-icon><DocumentChecked /></el-icon>
        保存
      </el-button>
    </header>

    <el-radio-group class="file-tabs" :model-value="currentPath" @update:model-value="$emit('open', String($event))">
      <el-radio-button v-for="file in files" :key="file.path" :label="file.path">
        {{ file.label }}
      </el-radio-button>
    </el-radio-group>

    <textarea
      class="support-textarea"
      :value="content"
      spellcheck="false"
      aria-label="资料 Markdown"
      @input="$emit('update:content', ($event.target as HTMLTextAreaElement).value)"
    />
  </section>
</template>

<script setup lang="ts">
import { DocumentChecked } from "@element-plus/icons-vue";

defineProps<{
  files: Array<{ label: string; path: string }>;
  currentPath: string;
  content: string;
  hasUnsavedChanges: boolean;
}>();

defineEmits<{
  open: [path: string];
  "update:content": [content: string];
  save: [];
}>();

</script>

<style scoped lang="scss">
.support-file-panel {
  display: flex;
  flex-direction: column;
  min-height: 300px;
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
    color: #6b7280;
    font-size: 12px;
  }
}

.panel-title {
  font-weight: 700;
}

.file-tabs {
  margin-bottom: 10px;
  overflow-x: auto;
}

.support-textarea {
  min-height: 240px;
  resize: vertical;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px;
  color: #111827;
  line-height: 1.7;
  font-family: "Microsoft YaHei", "PingFang SC", "Source Han Sans SC", sans-serif;
}
</style>
