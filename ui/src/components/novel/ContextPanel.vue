<template>
  <section class="context-panel" aria-label="当前上下文">
    <div class="panel-title">上下文</div>
    <dl v-if="project">
      <dt>作品</dt>
      <dd>{{ project.title }}</dd>
      <dt>题材</dt>
      <dd>{{ project.genre }}</dd>
      <dt>当前章节</dt>
      <dd>{{ chapter?.title || "未选择" }}</dd>
      <dt>AI 执行器</dt>
      <dd>{{ activeProfile?.label || project.ai?.profileId || "codex-cli" }}</dd>
    </dl>
    <div v-if="project" class="ai-config" aria-label="AI 执行器配置">
      <label>
        <span>执行器</span>
        <el-select v-model="selectedProfileId" size="small" placeholder="选择执行器">
          <el-option v-for="profile in profiles" :key="profile.id" :label="profile.label" :value="profile.id" />
        </el-select>
      </label>
      <label>
        <span>模型</span>
        <el-select
          v-model="selectedModelId"
          size="small"
          filterable
          :allow-create="activeProfile?.allowCustomModel ?? true"
          default-first-option
          placeholder="选择或输入模型，如 gpt-5.5"
        >
          <el-option label="默认模型" value="default" />
          <el-option v-for="model in activeProfile?.models || []" :key="model.id" :label="model.label" :value="model.id" />
        </el-select>
      </label>
      <div class="agent-status" :class="{ available: activeCheck?.available, unavailable: activeCheck && !activeCheck.available }">
        {{ agentStatusLabel }}
      </div>
      <div class="ai-actions">
        <el-button size="small" :loading="saving" @click="saveConfig">保存配置</el-button>
        <el-button size="small" :loading="checking" @click="checkConfig">测试连接</el-button>
      </div>
    </div>
    <div class="context-note">
      任务会自动注入故事圣经、章纲、伏笔账本和升级节奏；局部润色只注入选区附近上下文。
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AiAgentCheckResult, AiAgentProfile, NovelChapter, NovelProject } from "@/types/novel";

const props = defineProps<{
  project: NovelProject | null;
  chapter: NovelChapter | null;
  profiles: AiAgentProfile[];
  checks: AiAgentCheckResult[];
  saving: boolean;
  checking: boolean;
}>();

const emit = defineEmits<{
  "update-ai": [config: { profileId: string; modelId?: string }];
  "check-agent": [config: { profileId: string; modelId?: string }];
}>();

const selectedProfileId = ref("codex-cli");
const selectedModelId = ref("default");
const activeProfile = computed(() => props.profiles.find((profile) => profile.id === selectedProfileId.value));
const activeCheck = computed(() => props.checks.find((check) => check.profileId === selectedProfileId.value));
const agentStatusLabel = computed(() => {
  if (!activeCheck.value) return "尚未测试";
  if (activeCheck.value.available) return activeCheck.value.version || "连接正常";
  return activeCheck.value.error || "连接失败";
});

watch(
  () => [props.project?.ai?.profileId, props.project?.ai?.modelId, props.profiles.length] as const,
  () => {
    selectedProfileId.value = props.project?.ai?.profileId || props.profiles[0]?.id || "codex-cli";
    selectedModelId.value = props.project?.ai?.modelId || "default";
  },
  { immediate: true }
);

function normalizedConfig() {
  return {
    profileId: selectedProfileId.value,
    modelId: selectedModelId.value === "default" ? undefined : selectedModelId.value.trim()
  };
}

function saveConfig() {
  emit("update-ai", normalizedConfig());
}

function checkConfig() {
  emit("check-agent", normalizedConfig());
}
</script>

<style scoped lang="scss">
.context-panel {
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.panel-title {
  font-weight: 700;
  margin-bottom: 10px;
}

dl {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 10px;
  margin: 0;
}

dt {
  color: #6b7280;
}

dd {
  margin: 0;
  color: #111827;
}

.ai-config {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;

  label {
    display: grid;
    gap: 4px;

    span {
      color: #6b7280;
      font-size: 12px;
    }
  }
}

.agent-status {
  min-height: 24px;
  padding: 5px 8px;
  border-radius: 6px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  line-height: 1.3;

  &.available {
    background: #ecfdf5;
    color: #047857;
  }

  &.unavailable {
    background: #fef2f2;
    color: #991b1b;
  }
}

.ai-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.context-note {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  color: #4b5563;
  line-height: 1.6;
}
</style>
