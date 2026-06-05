<template>
  <section class="ai-config-panel" aria-label="全局 AI 配置">
    <header class="config-header">
      <div>
        <div class="panel-title">全局 AI 配置</div>
        <p>按创作场景选择执行器和模型；当前默认使用 Codex CLI，后续可以在这里接入在线 API。</p>
      </div>
      <div class="panel-actions">
        <el-button :loading="checking" @click="checkActiveScenario">
          <el-icon><Connection /></el-icon>
          测试当前
        </el-button>
        <el-button type="primary" :disabled="!isDirty" :loading="saving" @click="save">
          <el-icon><DocumentChecked /></el-icon>
          保存配置
        </el-button>
      </div>
    </header>

    <div class="config-browser">
      <aside class="scenario-pane" aria-label="AI 使用场景">
        <button
          v-for="scenario in scenarios"
          :key="scenario.key"
          type="button"
          :class="{ active: activeScenario === scenario.key }"
          :aria-pressed="activeScenario === scenario.key"
          @click="activeScenario = scenario.key"
        >
          <span>
            <strong>{{ scenario.label }}</strong>
            <small>{{ scenario.description }}</small>
          </span>
          <em>{{ profileLabel(localConfig.scenarios[scenario.key].profileId) }}</em>
        </button>
      </aside>

      <section class="scenario-detail" aria-label="场景 AI 配置">
        <div class="detail-heading">
          <div>
            <span class="detail-kicker">{{ activeScenarioMeta.description }}</span>
            <h3>{{ activeScenarioMeta.label }}</h3>
          </div>
          <span class="provider-badge">{{ providerLabel }}</span>
        </div>

        <div class="detail-grid">
          <label>
            <span>执行器</span>
            <el-select
              :model-value="activeScenarioConfig.profileId"
              filterable
              placeholder="选择执行器"
              @update:model-value="updateScenario('profileId', String($event))"
            >
              <el-option v-for="profile in profiles" :key="profile.id" :label="profile.label" :value="profile.id" />
            </el-select>
          </label>
          <label>
            <span>模型</span>
            <el-select
              :model-value="activeScenarioConfig.modelId || 'default'"
              filterable
              :allow-create="activeProfile?.allowCustomModel ?? true"
              default-first-option
              placeholder="选择或输入模型"
              @update:model-value="updateScenario('modelId', String($event))"
            >
              <el-option label="默认模型" value="default" />
              <el-option v-for="model in activeProfile?.models || []" :key="model.id" :label="model.label" :value="model.id" />
            </el-select>
          </label>
        </div>

        <div class="agent-status" :class="{ available: activeCheck?.available, unavailable: activeCheck && !activeCheck.available }">
          <span>连接状态</span>
          <strong>{{ agentStatusLabel }}</strong>
        </div>

        <div class="future-note">
          <span>预留能力</span>
          <p>在线 API、图片生成服务、视频生成服务后续可以作为新的执行器加入同一套场景配置，不需要塞回项目上下文。</p>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Connection, DocumentChecked } from "@element-plus/icons-vue";
import type { AiAgentCheckResult, AiAgentProfile, AiUsageScenarioKey, PlatformAiConfig } from "@/types/novel";

const props = defineProps<{
  config: PlatformAiConfig;
  profiles: AiAgentProfile[];
  checks: AiAgentCheckResult[];
  saving?: boolean;
  checking?: boolean;
}>();

const emit = defineEmits<{
  save: [config: PlatformAiConfig];
  check: [config: { profileId: string; modelId?: string }];
}>();

const scenarios: Array<{ key: AiUsageScenarioKey; label: string; description: string }> = [
  { key: "novel", label: "小说创作", description: "大纲、正文、审稿、故事总控" },
  { key: "assets", label: "素材管理", description: "角色、道具、世界观资料" },
  { key: "script", label: "剧本生产", description: "短剧、分场、对白" },
  { key: "image-generation", label: "图片生成", description: "角色图、场景图、提示词" },
  { key: "video-generation", label: "视频生成", description: "分镜、首尾帧、图生视频" }
];

const activeScenario = ref<AiUsageScenarioKey>("novel");
const localConfig = ref<PlatformAiConfig>(cloneConfig(props.config));

const activeScenarioMeta = computed(() => scenarios.find((scenario) => scenario.key === activeScenario.value) || scenarios[0]);
const activeScenarioConfig = computed(() => localConfig.value.scenarios[activeScenario.value]);
const activeProfile = computed(() => props.profiles.find((profile) => profile.id === activeScenarioConfig.value.profileId));
const activeCheck = computed(() => props.checks.find((check) => check.profileId === activeScenarioConfig.value.profileId));
const providerLabel = computed(() => {
  if (!activeProfile.value) return "本地 CLI";
  if (activeProfile.value.provider === "claude-code") return "Claude Code CLI";
  return "Codex CLI";
});
const agentStatusLabel = computed(() => {
  if (!activeCheck.value) return "尚未测试";
  if (activeCheck.value.available) return activeCheck.value.version || "连接正常";
  return activeCheck.value.error || "连接失败";
});
const isDirty = computed(() => JSON.stringify(localConfig.value) !== JSON.stringify(props.config));

watch(
  () => props.config,
  (config) => {
    localConfig.value = cloneConfig(config);
  },
  { deep: true }
);

function cloneConfig(config: PlatformAiConfig): PlatformAiConfig {
  return JSON.parse(JSON.stringify(config)) as PlatformAiConfig;
}

function profileLabel(profileId: string) {
  return props.profiles.find((profile) => profile.id === profileId)?.label || profileId || "Codex CLI";
}

function updateScenario(key: "profileId" | "modelId", value: string) {
  const nextValue = key === "modelId" && value === "default" ? undefined : value;
  localConfig.value = {
    ...localConfig.value,
    scenarios: {
      ...localConfig.value.scenarios,
      [activeScenario.value]: {
        ...localConfig.value.scenarios[activeScenario.value],
        [key]: nextValue
      }
    }
  };
}

function save() {
  emit("save", cloneConfig(localConfig.value));
}

function checkActiveScenario() {
  emit("check", {
    profileId: activeScenarioConfig.value.profileId,
    modelId: activeScenarioConfig.value.modelId
  });
}
</script>

<style scoped lang="scss">
.ai-config-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: min(620px, 74vh);
  color: #0f172a;
  background: #f8fafc;
}

.config-header,
.panel-actions,
.detail-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.config-header,
.detail-heading {
  justify-content: space-between;
}

.config-header {
  padding: 2px 2px 0;

  p {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 13px;
  }
}

.panel-title {
  color: #111827;
  font-size: 16px;
  font-weight: 800;
}

.panel-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.panel-actions :deep(.el-button) {
  border-radius: 6px;
}

.config-browser {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: minmax(280px, 330px) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.scenario-pane {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  border-right: 1px solid #e2e8f0;
  padding: 12px;
  background: #f8fafc;

  button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 58px;
    padding: 8px 10px 8px 12px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: #0f172a;
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;

    &:hover,
    &.active {
      border-color: #bfdbfe;
      background: #ffffff;
    }

    &.active {
      box-shadow: inset 3px 0 0 #2563eb;
    }

    span {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
    }

    strong,
    small,
    em {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: #64748b;
      font-size: 12px;
    }

    em {
      max-width: 108px;
      color: #64748b;
      font-size: 12px;
      font-style: normal;
    }
  }
}

.scenario-detail {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding: 18px;
}

.detail-heading {
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;

  h3 {
    margin: 3px 0 0;
    font-size: 20px;
    line-height: 1.3;
  }
}

.detail-kicker {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.provider-badge {
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 8px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  label {
    display: grid;
    gap: 5px;

    span {
      color: #475569;
      font-size: 12px;
      font-weight: 700;
    }
  }
}

.ai-config-panel :deep(.el-input__wrapper),
.ai-config-panel :deep(.el-select__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #d8dee8 inset;
}

.agent-status,
.future-note {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  background: #ffffff;
}

.agent-status {
  display: grid;
  gap: 4px;

  span {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  strong {
    color: #475569;
    font-size: 13px;
    line-height: 1.5;
  }

  &.available {
    border-color: #bbf7d0;
    background: #f0fdf4;

    strong {
      color: #047857;
    }
  }

  &.unavailable {
    border-color: #fecaca;
    background: #fef2f2;

    strong {
      color: #991b1b;
    }
  }
}

.future-note {
  span {
    color: #475569;
    font-size: 12px;
    font-weight: 700;
  }

  p {
    margin: 5px 0 0;
    color: #4b5563;
    line-height: 1.6;
  }
}

@media (max-width: 820px) {
  .config-header,
  .panel-actions,
  .detail-heading {
    align-items: stretch;
  }

  .config-browser,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .config-browser {
    overflow: visible;
  }

  .scenario-pane {
    border-right: 0;
    border-bottom: 1px solid #e2e8f0;
  }
}
</style>
