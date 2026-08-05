<template>
  <section v-if="blueprint || loadError || loading" class="story-blueprint-panel" data-testid="story-blueprint-panel">
    <div v-if="!blueprint" class="blueprint-load-error" :role="loadError ? 'alert' : 'status'">
      <strong>{{ loadError ? "故事蓝图暂时无法加载" : "正在获取已确认蓝图" }}</strong>
      <p>{{ loadError || "请稍候，系统正在同步蓝图状态。" }}</p>
      <button v-if="loadError" type="button" @click="emit('reload')">重新加载蓝图</button>
    </div>
    <template v-else>
    <div v-if="loading || loadError" class="blueprint-load-notice" :class="{ error: Boolean(loadError) }" :role="loadError ? 'alert' : 'status'">
      <span>{{ loadError || "正在获取最新故事蓝图，当前内容暂不可操作。" }}</span>
      <button v-if="loadError" type="button" @click="emit('reload')">重新加载蓝图</button>
    </div>
    <header>
      <div><p class="eyebrow">故事蓝图</p><h3>{{ confirmed ? "故事蓝图已确认" : "请确认或修改故事蓝图" }}</h3></div>
      <span :class="{ confirmed }">{{ confirmed ? "已确认" : "待确认" }}</span>
    </header>
    <p v-if="!confirmed" class="notice">你可以直接修改内容；重新生成会基于当前设定创建新版本，当前蓝图会保留。</p>
    <div class="blueprint-fields">
      <label v-for="field in fields" :key="field.key"><span>{{ field.label }}</span><textarea v-model="draft[field.key]" :disabled="busy || confirmed || loading || Boolean(loadError)" rows="2" /></label>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="!confirmed" class="actions">
      <button type="button" :disabled="busy || loading || Boolean(loadError)" @click="emit('revise', { ...draft })">保存修改</button>
      <button type="button" class="secondary" :disabled="busy || loading || Boolean(loadError)" @click="emit('regenerate')">重新生成</button>
      <button type="button" class="confirm" :disabled="busy || loading || Boolean(loadError)" @click="emit('confirm')">确认蓝图</button>
    </div>
    <div v-else class="ready-actions">
      <p class="ready">故事蓝图已确认。下一步请开始制定大纲，系统会生成可继续修改的章节方案。</p>
      <button type="button" class="start-outline" :disabled="busy || loading || Boolean(loadError)" @click="emit('start-outline')">{{ loading ? "正在同步蓝图" : loadError ? "请先重新加载蓝图" : busy ? "正在生成大纲" : "开始制定大纲" }}</button>
    </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { StoryBlueprint, StoryBlueprintContent } from "@/types/novel";

const props = defineProps<{ blueprint: StoryBlueprint | null; confirmed?: boolean; busy?: boolean; error?: string; loadError?: string; loading?: boolean }>();
const emit = defineEmits<{ revise: [content: StoryBlueprintContent]; regenerate: []; confirm: []; "start-outline": []; reload: [] }>();
const fields: Array<{ key: keyof StoryBlueprintContent; label: string }> = [
  { key: "storyPremise", label: "故事前提" }, { key: "openingImage", label: "开场画面" }, { key: "protagonistGoal", label: "主角目标" }, { key: "coreConflict", label: "核心冲突" },
  { key: "failureCost", label: "失败代价" }, { key: "worldRules", label: "世界规则" }, { key: "readerPromise", label: "读者期待" }, { key: "endingDirection", label: "结局方向" }
];
const draft = reactive<StoryBlueprintContent>({ storyPremise: "", openingImage: "", protagonistGoal: "", coreConflict: "", failureCost: "", worldRules: "", readerPromise: "", endingDirection: "" });
watch(() => props.blueprint?.content, (content) => { if (content) Object.assign(draft, content); }, { immediate: true, deep: true });
</script>

<style scoped>
.story-blueprint-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-color-success-light-5); border-radius: 12px; background: var(--el-bg-color-overlay); }
header { display: flex; justify-content: space-between; gap: 12px; } .eyebrow { margin: 0; color: var(--el-color-success); font-size: 12px; } h3 { margin: 4px 0 0; } header > span { color: var(--el-color-warning); font-size: 13px; } header > span.confirmed, .ready { color: var(--el-color-success); }
.notice, .ready, .error { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }.error { color: var(--el-color-danger); }
.blueprint-load-error { display: grid; gap: 8px; color: var(--el-color-danger); }.blueprint-load-error p { margin: 0; color: var(--el-text-color-secondary); }.blueprint-load-error button { justify-self: start; padding: 8px 12px; border: 1px solid currentColor; border-radius: 7px; background: transparent; color: inherit; cursor: pointer; }
.blueprint-load-notice { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; color: var(--el-color-primary); background: var(--el-color-primary-light-9); font-size: 13px; }.blueprint-load-notice.error { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }.blueprint-load-notice button { padding: 5px 8px; border: 1px solid currentColor; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.blueprint-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.blueprint-fields label { display: grid; gap: 5px; font-weight: 600; }.blueprint-fields textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 8px; font: inherit; }
.actions, .ready-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }.actions button, .start-outline { padding: 8px 12px; border: 0; border-radius: 7px; color: white; background: var(--el-color-primary); cursor: pointer; }.actions .secondary { color: var(--el-color-primary); background: transparent; border: 1px solid var(--el-color-primary); }.actions .confirm, .start-outline { background: var(--el-color-success); }.actions button:disabled, .start-outline:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 760px) { .blueprint-fields { grid-template-columns: 1fr; } }
</style>
