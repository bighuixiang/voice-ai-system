<template>
  <section class="focus-writing-panel" aria-label="专注写作推进器">
    <header class="panel-header">
      <div>
        <div class="panel-title">
          <el-icon><Aim /></el-icon>
          今日写作推进器
        </div>
        <p>{{ guide.stageLabel }} · {{ guide.sceneTitle }}</p>
      </div>
      <div class="target-control">
        <span>目标字数</span>
        <el-input-number
          :model-value="guide.targetWords"
          :min="300"
          :max="12000"
          :step="100"
          size="small"
          controls-position="right"
          @update:model-value="updateTarget"
        />
      </div>
    </header>

    <div class="progress-row" aria-label="写作进度">
      <span>{{ guide.currentWords }} / {{ guide.targetWords }} 字</span>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${guide.progressPercent}%` }" />
      </div>
      <strong>{{ guide.progressPercent }}%</strong>
    </div>

    <div class="focus-grid">
      <article class="next-beat">
        <span>下一笔</span>
        <p>{{ guide.nextBeat }}</p>
      </article>
      <article class="guardrails">
        <span>守住</span>
        <ul v-if="guide.guardrails.length">
          <li v-for="item in guide.guardrails" :key="item">{{ item }}</li>
        </ul>
        <p v-else>先补章节目标、视角和冲突，正文会更稳。</p>
      </article>
    </div>

    <label class="micro-command">
      <span>AI 微调指令</span>
      <el-input
        :model-value="instruction"
        type="textarea"
        :rows="2"
        maxlength="240"
        show-word-limit
        resize="none"
        placeholder="例如：多写一点心理活动；冲突更直接；少解释设定，保持主角有限视角。"
        @update:model-value="updateInstruction"
      />
    </label>

    <footer class="panel-actions">
      <el-button type="primary" size="small" :disabled="!canGenerate" :loading="isGenerating" @click="$emit('generate-draft')">
        <el-icon><MagicStick /></el-icon>
        AI 写下一段
      </el-button>
      <el-button size="small" @click="$emit('open-structure')">
        <el-icon><DataAnalysis /></el-icon>
        调结构
      </el-button>
      <el-button size="small" @click="$emit('open-review')">
        <el-icon><Finished /></el-icon>
        去审稿
      </el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { Aim, DataAnalysis, Finished, MagicStick } from "@element-plus/icons-vue";
import type { FocusWritingGuide } from "@/types/novel";

const DEFAULT_TARGET_WORDS = 3000;

withDefaults(defineProps<{
  guide: FocusWritingGuide;
  canGenerate?: boolean;
  isGenerating?: boolean;
  instruction?: string;
}>(), {
  canGenerate: true,
  isGenerating: false,
  instruction: ""
});

const emit = defineEmits<{
  "update-target": [value: number];
  "update-instruction": [value: string];
  "generate-draft": [];
  "open-structure": [];
  "open-review": [];
}>();

function updateTarget(value: number | null) {
  emit("update-target", value || DEFAULT_TARGET_WORDS);
}

function updateInstruction(value: string | number) {
  emit("update-instruction", String(value));
}
</script>

<style scoped lang="scss">
.focus-writing-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.panel-header,
.progress-row,
.panel-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-primary);
  font-weight: 800;
}

.panel-header p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}

.target-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.progress-row {
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.progress-track {
  position: relative;
  height: 8px;
  min-width: 120px;
  flex: 1 1 auto;
  overflow: hidden;
  border-radius: 999px;
  background: var(--app-bg-muted);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--app-primary), var(--app-success));
  transition: width 160ms ease;
}

.focus-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 10px;
}

.next-beat,
.guardrails {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);

  span {
    display: block;
    margin-bottom: 6px;
    color: var(--app-text-muted);
    font-size: 12px;
    font-weight: 800;
  }

  p {
    margin: 0;
    color: var(--app-text-primary);
    font-size: 13px;
    line-height: 1.6;
  }
}

.guardrails ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 16px;
  color: var(--app-text-primary);
  font-size: 12px;
  line-height: 1.5;
}

.micro-command {
  display: grid;
  gap: 6px;

  span {
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 800;
  }
}

.panel-actions {
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .panel-header,
  .progress-row {
    align-items: stretch;
    flex-direction: column;
  }

  .target-control {
    justify-content: space-between;
  }

  .focus-grid {
    grid-template-columns: 1fr;
  }

  .progress-track {
    width: 100%;
  }
}
</style>
