<template>
  <section class="structure-quick-start-panel" aria-label="结构助手">
    <header>
      <div>
        <div class="panel-title">结构助手</div>
        <p>有正文就反写结构；没正文就先写一句想法。</p>
      </div>
      <el-button :disabled="!canSaveStructure" :loading="isSaving" @click="$emit('save-structure')">
        <el-icon><DocumentChecked /></el-icon>
        保存结构
      </el-button>
    </header>

    <div class="quick-body">
      <el-input
        class="idea-input"
        :model-value="idea"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 4 }"
        placeholder="例：主角在山门外发现异常印记，想靠近又怕暴露，结尾印记回应了他。"
        @update:model-value="$emit('update:idea', String($event))"
      />

      <div class="quick-actions">
        <el-tooltip content="从当前章节正文反推出仪表盘和场景卡" placement="top">
          <el-button :disabled="!canReverseEngineer" @click="$emit('reverse-from-draft')">
            <el-icon><Reading /></el-icon>
            从正文反写
          </el-button>
        </el-tooltip>
        <el-tooltip content="用上方一句想法先生成章节目标、冲突、钩子和场景卡" placement="top">
          <el-button type="primary" :disabled="!idea.trim()" @click="$emit('generate-from-idea')">
            <el-icon><MagicStick /></el-icon>
            用想法起结构
          </el-button>
        </el-tooltip>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { DocumentChecked, MagicStick, Reading } from "@element-plus/icons-vue";

defineProps<{
  idea: string;
  canReverseEngineer: boolean;
  canSaveStructure: boolean;
  isSaving?: boolean;
}>();

defineEmits<{
  "update:idea": [value: string];
  "reverse-from-draft": [];
  "generate-from-idea": [];
  "save-structure": [];
}>();
</script>

<style scoped lang="scss">
.structure-quick-start-panel {
  padding: 12px;
  border: 1px solid #cbd5e1;
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
  font-weight: 800;
}

.quick-body {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  gap: 10px;
  align-items: stretch;
}

.idea-input {
  min-width: 0;
}

.quick-actions {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-wrap: wrap;

  :deep(.el-button) {
    min-height: 100%;
  }
}

@media (max-width: 760px) {
  header,
  .quick-body,
  .quick-actions {
    align-items: stretch;
    grid-template-columns: 1fr;
  }
}
</style>
