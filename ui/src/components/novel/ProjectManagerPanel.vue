<template>
  <section class="project-manager" aria-labelledby="project-manager-title">
    <div class="panel-title">
      <div>
        <h2 id="project-manager-title">项目列表</h2>
        <p>本地文件存储；后续可替换为 SQLite 或服务端项目库。</p>
      </div>
      <el-button circle :loading="loading" aria-label="刷新项目" @click="$emit('refresh')">
        <el-icon><Refresh /></el-icon>
      </el-button>
    </div>

    <div class="project-list" role="list">
      <button
        v-for="project in projects"
        :key="project.slug"
        class="project-item"
        :class="{ active: currentProject?.slug === project.slug }"
        type="button"
        @click="$emit('open', project)"
      >
        <span class="project-icon"><el-icon><FolderOpened /></el-icon></span>
        <span class="project-copy">
          <strong>{{ project.title }}</strong>
          <small>{{ project.genre }} · {{ project.chapters.length }} 章 · {{ moduleSummary(project) }}</small>
        </span>
      </button>
      <p v-if="projects.length === 0" class="empty-copy">还没有项目。先创建或导入一个。</p>
    </div>

    <el-form class="import-form" label-position="top" @submit.prevent="handleImport">
      <el-form-item label="导入本地目录">
        <div class="path-picker">
          <el-input v-model="sourcePath" placeholder="D:\\novels\\my-story" />
          <div class="path-actions">
            <el-button native-type="button" @click="openDirectoryPicker">
              <el-icon><FolderOpened /></el-icon>
              选择目录
            </el-button>
            <el-button native-type="button" @click="pasteSourcePath">
              <el-icon><CopyDocument /></el-icon>
              粘贴路径
            </el-button>
          </div>
          <input
            ref="directoryInput"
            class="directory-input"
            type="file"
            webkitdirectory
            directory
            @change="handleDirectorySelected"
          />
        </div>
      </el-form-item>
      <div class="import-grid">
        <el-form-item label="新项目名">
          <el-input v-model="title" placeholder="可留空" />
        </el-form-item>
        <el-form-item label="题材">
          <el-select
            v-model="genres"
            class="genre-select"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择题材"
          >
            <el-option v-for="option in novelGenreOptions" :key="option" :label="option" :value="option" />
          </el-select>
        </el-form-item>
      </div>
      <el-button class="import-button" :loading="loading" @click="handleImport">
        <el-icon><Upload /></el-icon>
        导入为新项目
      </el-button>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { CopyDocument, FolderOpened, Refresh, Upload } from "@element-plus/icons-vue";
import type { NovelProject } from "@/types/novel";
import { formatGenres, novelGenreOptions } from "./genreOptions";

defineProps<{
  projects: NovelProject[];
  currentProject: NovelProject | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  open: [project: NovelProject];
  "import-project": [input: { sourcePath: string; title?: string; genre?: string }];
}>();

const sourcePath = ref("");
const title = ref("");
const genres = ref<string[]>([]);
const directoryInput = ref<HTMLInputElement | null>(null);

function moduleSummary(project: NovelProject) {
  const modules = project.modules || [{ key: "novel", label: "Novel Writing", status: "active" }];
  const activeCount = modules.filter((module) => module.status === "active").length;
  return `${activeCount}/${modules.length} 模块`;
}

function openDirectoryPicker() {
  directoryInput.value?.click();
}

function guessTitleFromPath(pathValue: string) {
  const normalized = pathValue.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || "";
}

function normalizePastedPath(pathValue: string) {
  return pathValue.trim().replace(/^["']|["']$/g, "");
}

async function pasteSourcePath() {
  const clipboardText = await navigator.clipboard?.readText?.().catch(() => "");
  const pastedPath = normalizePastedPath(clipboardText || "");
  if (!pastedPath) {
    ElMessage.warning("剪贴板里没有可用路径。");
    return;
  }

  sourcePath.value = pastedPath;
  if (!title.value.trim()) {
    title.value = guessTitleFromPath(pastedPath);
  }
}

function handleDirectorySelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const firstFile = input.files?.[0] as (File & { webkitRelativePath?: string }) | undefined;
  const directoryName = firstFile?.webkitRelativePath?.split(/[\\/]/)[0] || "";
  if (directoryName && !title.value.trim()) {
    title.value = directoryName;
  }
  input.value = "";
}

function handleImport() {
  const trimmedSourcePath = sourcePath.value.trim();
  if (!trimmedSourcePath) {
    ElMessage.warning("请填写要导入的本地目录。");
    return;
  }

  emit("import-project", {
    sourcePath: trimmedSourcePath,
    title: title.value.trim() || undefined,
    genre: formatGenres(genres.value) || undefined
  });
}
</script>

<style scoped lang="scss">
.project-manager {
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.panel-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  h2 {
    margin: 0 0 2px;
    font-size: 16px;
  }

  p {
    margin: 0;
    color: #6b7280;
    font-size: 12px;
  }
}

.project-list {
  display: grid;
  gap: 6px;
  max-height: 280px;
  overflow: auto;
  margin-bottom: 12px;
}

.project-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #f8fafc;
  color: #111827;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: #93c5fd;
    outline: none;
  }

  &.active {
    border-color: #2563eb;
    background: #eff6ff;
  }
}

.project-icon {
  display: grid;
  place-items: center;
  color: #2563eb;
}

.project-copy {
  min-width: 0;

  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: #6b7280;
    font-size: 12px;
  }
}

.empty-copy {
  margin: 0;
  padding: 8px;
  color: #6b7280;
  background: #f8fafc;
  border-radius: 6px;
}

.import-form {
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
}

.path-picker {
  display: grid;
  gap: 8px;
}

.path-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.directory-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.import-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.import-button {
  width: 100%;
}

.genre-select {
  width: 100%;
}

@media (max-width: 760px) {
  .import-grid {
    grid-template-columns: 1fr;
  }

  .path-actions {
    grid-template-columns: 1fr;
  }
}
</style>
