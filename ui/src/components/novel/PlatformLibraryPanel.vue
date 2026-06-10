<template>
  <section class="platform-panel" aria-labelledby="platform-library-title">
    <header class="panel-header">
      <div>
        <h2 id="platform-library-title">平台资料库</h2>
        <p>共享素材、提示词、专家角色和 Skills</p>
      </div>
      <el-button circle :loading="loading" aria-label="刷新平台资料库" @click="$emit('refresh')">
        <el-icon><Refresh /></el-icon>
      </el-button>
    </header>

    <el-tabs v-model="activeTab" stretch>
      <el-tab-pane label="素材" name="assets">
        <form class="asset-form" @submit.prevent="submitAsset">
          <el-input v-model="assetName" placeholder="新共享素材名称" aria-label="新共享素材名称" />
          <el-select v-model="assetType" aria-label="素材类型">
            <el-option label="角色" value="character" />
            <el-option label="道具" value="prop" />
            <el-option label="场景" value="scene" />
            <el-option label="参考图" value="reference" />
            <el-option label="首尾帧" value="frame" />
            <el-option label="视频" value="video" />
          </el-select>
          <el-button native-type="submit" type="primary" :disabled="!assetName.trim()">
            <el-icon><Plus /></el-icon>
          </el-button>
        </form>

        <div class="asset-list" role="list">
          <article v-for="asset in visibleAssets" :key="asset.id" class="asset-item" role="listitem">
            <div>
              <strong>{{ asset.name }}</strong>
              <p>{{ asset.type }} · {{ asset.scope }}</p>
            </div>
            <div class="asset-actions">
              <el-tag v-if="projectSlug && asset.linkedProjects.includes(projectSlug)" size="small" type="success">
                已关联
              </el-tag>
              <el-button
                v-else-if="projectSlug"
                size="small"
                :aria-label="`关联素材 ${asset.name}`"
                @click="$emit('link-asset', asset)"
              >
                <el-icon><Connection /></el-icon>
              </el-button>
            </div>
          </article>
          <p v-if="!visibleAssets.length" class="empty-text">还没有共享素材。</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="提示词" name="prompts">
        <article v-for="prompt in library?.prompts || []" :key="prompt.id" class="prompt-item">
          <strong>{{ prompt.title }}</strong>
          <p>{{ roleName(prompt.roleId) }} · {{ prompt.category }}</p>
          <span>{{ prompt.prompt }}</span>
        </article>
      </el-tab-pane>

      <el-tab-pane label="角色" name="roles">
        <article v-for="role in library?.roles || []" :key="role.id" class="prompt-item">
          <strong>{{ role.name }}</strong>
          <p>{{ role.domain }}</p>
          <span>{{ role.systemPrompt }}</span>
        </article>
      </el-tab-pane>

      <el-tab-pane label="Skills" name="skills">
        <article v-for="skill in library?.skills || []" :key="skill.id" class="skill-item">
          <div>
            <strong>{{ skill.name }}</strong>
            <p>{{ skill.description }}</p>
          </div>
          <el-tag size="small" :type="skill.enabled ? 'success' : 'info'">{{ skill.scope }}</el-tag>
        </article>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Connection, Plus, Refresh } from "@element-plus/icons-vue";
import type { PlatformAsset, PlatformAssetType, PlatformLibrary } from "@/types/novel";

const props = defineProps<{
  library: PlatformLibrary | null;
  projectSlug?: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  "create-asset": [{ name: string; type: PlatformAssetType }];
  "link-asset": [asset: PlatformAsset];
}>();

const activeTab = ref("assets");
const assetName = ref("");
const assetType = ref<PlatformAssetType>("character");

const visibleAssets = computed(() => props.library?.assets || []);

function roleName(roleId: string) {
  return props.library?.roles.find((role) => role.id === roleId)?.name || roleId;
}

function submitAsset() {
  const name = assetName.value.trim();
  if (!name) return;
  emit("create-asset", { name, type: assetType.value });
  assetName.value = "";
}
</script>

<style scoped lang="scss">
.platform-panel {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;

  h2 {
    margin: 0 0 3px;
    font-size: 15px;
  }

  p {
    margin: 0;
    color: var(--app-text-muted);
    font-size: 12px;
  }
}

.asset-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px 34px;
  gap: 6px;
  margin-bottom: 10px;
}

.asset-list,
.prompt-item,
.skill-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.asset-item,
.prompt-item,
.skill-item {
  padding: 9px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
}

.asset-item,
.skill-item {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.asset-item strong,
.prompt-item strong,
.skill-item strong {
  display: block;
  margin-bottom: 3px;
  font-size: 13px;
}

.asset-item p,
.prompt-item p,
.skill-item p {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
}

.prompt-item span {
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.asset-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.empty-text {
  margin: 8px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}
</style>
