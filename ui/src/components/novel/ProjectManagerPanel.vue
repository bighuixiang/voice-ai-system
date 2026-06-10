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
      <div
        v-for="project in projects"
        :key="project.slug"
        class="project-item"
        :class="{ active: currentProject?.slug === project.slug }"
        role="listitem"
      >
        <button class="project-open" type="button" @click="$emit('open', project)">
          <span class="project-icon"><el-icon><FolderOpened /></el-icon></span>
          <span class="project-copy">
            <strong>{{ project.title }}</strong>
          <small>{{ project.genre }} · {{ project.chapters.length }} 章 · {{ moduleSummary(project) }}</small>
          </span>
        </button>
        <el-tooltip content="删除项目" placement="top">
          <el-button
            class="project-delete"
            type="danger"
            plain
            circle
            :disabled="loading"
            aria-label="删除项目"
            @click.stop="$emit('delete-project', project)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
      <p v-if="projects.length === 0" class="empty-copy">还没有项目。先创建或导入一个。</p>
    </div>

    <el-form class="import-form" label-position="top" @submit.prevent="handleImport">
      <el-form-item label="导入本地目录">
        <div class="path-picker">
          <el-input :model-value="sourcePath" placeholder="D:\\novels\\my-story" @update:model-value="handleSourcePathInput" />
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
import { CopyDocument, Delete, FolderOpened, Refresh, Upload } from "@element-plus/icons-vue";
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
  "delete-project": [project: NovelProject];
  "import-project": [
    input: {
      sourcePath: string;
      title?: string;
      genre?: string;
      files?: Array<{ relativePath: string; content: string }>;
    }
  ];
}>();

const sourcePath = ref("");
const title = ref("");
const genres = ref<string[]>([]);
const directoryInput = ref<HTMLInputElement | null>(null);
const selectedDirectoryFiles = ref<Array<{ relativePath: string; content: string }>>([]);
const selectedDirectoryName = ref("");

function moduleSummary(project: NovelProject) {
  const modules = project.modules || [{ key: "novel", label: "Novel Writing", status: "active" }];
  const activeCount = modules.filter((module) => module.status === "active").length;
  return `${activeCount}/${modules.length} 模块`;
}

function openDirectoryPicker() {
  directoryInput.value?.click();
}

function handleSourcePathInput(value: string | number) {
  sourcePath.value = String(value || "");
  selectedDirectoryFiles.value = [];
  selectedDirectoryName.value = "";
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

  selectedDirectoryFiles.value = [];
  selectedDirectoryName.value = "";
  sourcePath.value = pastedPath;
  if (!title.value.trim()) {
    title.value = guessTitleFromPath(pastedPath);
  }
}

function isImportableBrowserFile(file: File & { webkitRelativePath?: string }) {
  const relativePath = file.webkitRelativePath || file.name;
  return /\.(md|txt)$/i.test(relativePath) && file.size <= 500 * 1024;
}

async function handleDirectorySelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []) as Array<File & { webkitRelativePath?: string }>;
  const firstFile = files[0];
  const directoryName = firstFile?.webkitRelativePath?.split(/[\\/]/)[0] || "";
  const importableFiles = files.filter(isImportableBrowserFile);
  if (!importableFiles.length) {
    ElMessage.warning("选择的目录里没有可导入的 .md 或 .txt 文件。");
    input.value = "";
    return;
  }

  const uploadedFiles = await Promise.all(
    importableFiles.map(async (file) => ({
      relativePath: file.webkitRelativePath || file.name,
      content: await file.text()
    }))
  );
  selectedDirectoryFiles.value = uploadedFiles;
  selectedDirectoryName.value = directoryName || guessTitleFromPath(uploadedFiles[0]?.relativePath || "");
  sourcePath.value = `已选择目录：${selectedDirectoryName.value || "本地目录"}（${uploadedFiles.length} 个文件）`;
  if (directoryName && !title.value.trim()) {
    title.value = directoryName;
  }
  input.value = "";
}

function handleImport() {
  const trimmedSourcePath = sourcePath.value.trim();
  const uploadedFiles = selectedDirectoryFiles.value;
  if (!trimmedSourcePath && uploadedFiles.length === 0) {
    ElMessage.warning("请填写要导入的本地目录。");
    return;
  }

  emit("import-project", {
    sourcePath: uploadedFiles.length ? selectedDirectoryName.value || trimmedSourcePath : trimmedSourcePath,
    title: title.value.trim() || undefined,
    genre: formatGenres(genres.value) || undefined,
    files: uploadedFiles.length ? uploadedFiles : undefined
  });
}
</script>

<style scoped lang="scss">
.project-manager {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.panel-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  h2 {
    margin: 0 0 2px;
    font-size: 16px;
    color: var(--app-text-primary);
  }

  p {
    margin: 0;
    color: var(--app-text-muted);
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
  grid-template-columns: minmax(0, 1fr) 32px;
  align-items: center;
  gap: 4px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--app-bg-soft);
  color: var(--app-text-primary);

  &:hover,
  &:focus-visible {
    border-color: var(--app-primary);
    outline: none;
  }

  &.active {
    border-color: var(--app-primary);
    background: var(--app-primary-soft);
  }
}

.project-open {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  padding: 9px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--app-primary);
    outline-offset: -2px;
  }
}

.project-delete {
  margin-right: 6px;
}

.project-icon {
  display: grid;
  place-items: center;
  color: var(--app-primary);
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
    color: var(--app-text-muted);
    font-size: 12px;
  }
}

.empty-copy {
  margin: 0;
  padding: 8px;
  color: var(--app-text-muted);
  background: var(--app-bg-soft);
  border-radius: 6px;
}

.import-form {
  border-top: 1px solid var(--app-border);
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
