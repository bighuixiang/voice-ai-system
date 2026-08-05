<template>
  <section class="author-journey-progress" data-testid="author-journey-progress" aria-label="创作进度">
    <header>
      <div>
        <p class="eyebrow">创作进度</p>
        <strong>{{ currentStep.label }}</strong>
      </div>
      <span class="progress-count">已完成 {{ progress.completed }}/{{ progress.total }} 项</span>
    </header>
    <ol>
      <li v-for="(step, index) in steps" :key="step.key" :class="{ current: index === currentIndex, completed: index < currentIndex }">
        <span>{{ index < currentIndex ? "已完成" : index === currentIndex ? "进行中" : "待开始" }}</span>
        <b>{{ step.label }}</b>
      </li>
    </ol>
    <p class="next-instruction">下一步：{{ processing ? "系统正在处理，请稍候。" : journey?.nextInstruction || currentStep.instruction }}</p>
    <p v-if="journey?.blueprintNeedsRefresh" class="refresh-notice">已收到补充想法：请更新故事蓝图并再次确认。</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CreativeJourneyProjection } from "@/types/novel";

const props = defineProps<{ journey?: CreativeJourneyProjection | null; processing?: boolean }>();
const progress = computed(() => props.journey?.progress || { completed: 0, total: 10, current: 1 });

const steps = [
  { key: "capture", label: "记录想法", instruction: "请先用自己的话描述想创作的故事。" },
  { key: "understanding", label: "整理素材", instruction: "系统会整理你的想法与待确认重点。" },
  { key: "questions", label: "补全设定", instruction: "请回答当前关键问题。" },
  { key: "blueprint", label: "故事蓝图", instruction: "请确认或修改故事蓝图。" },
  { key: "outline", label: "制定大纲", instruction: "故事蓝图确认后即可开始制定大纲。" }
];

const currentIndex = computed(() => {
  if (!props.journey || props.journey.stage === "capture") return 0;
  if (props.journey.stage === "blueprint-review") return 3;
  if (props.journey.stage === "ready-for-outline") return 4;
  return props.journey.activeQuestion || progress.value.completed > 0 ? 2 : 1;
});
const currentStep = computed(() => steps[currentIndex.value]);
</script>

<style scoped>
.author-journey-progress { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--el-color-primary-light-5); border-radius: 12px; background: var(--el-color-primary-light-9); }
header, ol { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.eyebrow { margin: 0 0 3px; color: var(--el-color-primary); font-size: 12px; }
.progress-count, .next-instruction { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }.refresh-notice { margin: 0; color: var(--el-color-warning-dark-2); font-size: 13px; }
ol { margin: 0; padding: 0; list-style: none; align-items: stretch; }
li { display: grid; gap: 3px; flex: 1; min-width: 0; color: var(--el-text-color-placeholder); font-size: 12px; }
li span { font-size: 11px; } li b { font-size: 13px; }
li.current { color: var(--el-color-primary); } li.completed { color: var(--el-color-success); }
@media (max-width: 760px) { ol { display: grid; grid-template-columns: 1fr 1fr; } }
</style>
