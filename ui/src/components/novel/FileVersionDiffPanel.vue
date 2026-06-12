<template>
  <section class="file-version-diff-panel" aria-label="版本快照对比">
    <header class="diff-toolbar">
      <div>
        <strong>版本快照</strong>
        <small>{{ versions.length ? `${versions.length} 个历史版本` : "保存正文或章纲后生成" }}</small>
      </div>
      <div class="diff-actions">
        <el-button size="small" :loading="loadingVersions" @click="$emit('refresh')">
          刷新
        </el-button>
        <el-button size="small" :disabled="!diff" @click="$emit('close')">
          关闭对比
        </el-button>
      </div>
    </header>

    <div v-if="versions.length" class="version-list">
      <button
        v-for="version in versions"
        :key="version.id"
        type="button"
        class="version-item"
        :class="{ active: diff?.fromVersion.id === version.id }"
        @click="$emit('preview', version.id)"
      >
        <span>{{ formatTime(version.createdAt) }}</span>
        <small>{{ formatSize(version.size) }}</small>
      </button>
    </div>
    <el-empty v-else class="version-empty" description="暂无快照" :image-size="44" />

    <div v-if="loadingDiff" class="diff-loading">正在读取差异...</div>
    <div v-else-if="diff" class="diff-view">
      <div v-if="!usePlainDiff" ref="diffHost" class="monaco-diff-host" />
      <div v-else class="plain-diff">
        <pre>{{ diff.original }}</pre>
        <pre>{{ diff.modified }}</pre>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { FileDiffResult, FileVersionSnapshot } from "@/types/novel";

type MonacoApi = typeof import("monaco-editor/esm/vs/editor/editor.api");
type MonacoDiffEditor = import("monaco-editor").editor.IStandaloneDiffEditor;
type MonacoModel = import("monaco-editor").editor.ITextModel;

const props = defineProps<{
  versions: FileVersionSnapshot[];
  diff: FileDiffResult | null;
  loadingVersions?: boolean;
  loadingDiff?: boolean;
}>();

defineEmits<{
  refresh: [];
  preview: [versionId: string];
  close: [];
}>();

const diffHost = ref<HTMLElement | null>(null);
const usePlainDiff = ref(
  typeof window === "undefined" || (typeof navigator !== "undefined" && typeof navigator.userAgent === "string" && navigator.userAgent.includes("jsdom"))
);
let monaco: MonacoApi | null = null;
let diffEditor: MonacoDiffEditor | null = null;
let originalModel: MonacoModel | null = null;
let modifiedModel: MonacoModel | null = null;

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

async function loadMonaco(): Promise<MonacoApi> {
  if (typeof window !== "undefined") {
    const monacoWindow = window as Window & {
      MonacoEnvironment?: { getWorker: () => Worker };
    };
    monacoWindow.MonacoEnvironment ||= {
      getWorker() {
        return new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), { type: "module" });
      }
    };
  }
  return import("monaco-editor/esm/vs/editor/editor.api");
}

async function initDiffEditor() {
  if (usePlainDiff.value || diffEditor || !diffHost.value || !props.diff) return;
  try {
    monaco = await loadMonaco();
    monaco.editor.defineTheme("plotpilot-diff-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [{ token: "", foreground: "d7dee8", background: "0b1120" }],
      colors: {
        "editor.background": "#0b1120",
        "editor.foreground": "#d7dee8",
        "editorGutter.background": "#0b1120",
        "diffEditor.insertedTextBackground": "#14532d66",
        "diffEditor.removedTextBackground": "#7f1d1d66",
        "editorLineNumber.foreground": "#64748b"
      }
    });
    diffEditor = monaco.editor.createDiffEditor(diffHost.value, {
      theme: "plotpilot-diff-dark",
      automaticLayout: true,
      renderSideBySide: true,
      readOnly: true,
      minimap: { enabled: false },
      wordWrap: "on",
      scrollBeyondLastLine: false
    });
    syncDiffModels();
  } catch {
    disposeDiffEditor();
    usePlainDiff.value = true;
    await nextTick();
  }
}

function syncDiffModels() {
  if (!monaco || !diffEditor || !props.diff) return;
  originalModel?.dispose();
  modifiedModel?.dispose();
  const original = monaco.editor.createModel(props.diff.original, "markdown");
  const modified = monaco.editor.createModel(props.diff.modified, "markdown");
  originalModel = original;
  modifiedModel = modified;
  diffEditor.setModel({
    original,
    modified
  });
}

function disposeDiffEditor() {
  diffEditor?.dispose();
  originalModel?.dispose();
  modifiedModel?.dispose();
  diffEditor = null;
  originalModel = null;
  modifiedModel = null;
}

onMounted(() => {
  initDiffEditor();
});

onBeforeUnmount(() => {
  disposeDiffEditor();
});

watch(
  () => props.diff,
  async () => {
    if (!props.diff) {
      disposeDiffEditor();
      return;
    }
    await nextTick();
    if (!diffEditor) {
      await initDiffEditor();
      return;
    }
    syncDiffModels();
  }
);
</script>

<style scoped lang="scss">
.file-version-diff-panel {
  display: grid;
  gap: 10px;
  color: var(--app-text-primary);
}

.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  strong,
  small {
    display: block;
  }

  small {
    margin-top: 3px;
    color: var(--app-text-muted);
  }
}

.diff-actions {
  display: flex;
  gap: 8px;
}

.version-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.version-item {
  min-width: 132px;
  padding: 7px 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg-soft);
  color: var(--app-text-secondary);
  text-align: left;
  cursor: pointer;

  span,
  small {
    display: block;
  }

  small {
    margin-top: 3px;
    color: var(--app-text-muted);
  }

  &.active {
    border-color: var(--app-primary);
    background: var(--app-primary-soft);
    color: var(--app-primary-text);
  }
}

.version-empty {
  --el-empty-fill-color-0: var(--app-bg-muted);
  --el-empty-fill-color-1: var(--app-bg-soft);
  --el-empty-fill-color-2: var(--app-border);
  padding: 4px 0;
}

.diff-loading {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg-soft);
  color: var(--app-text-secondary);
}

.diff-view,
.monaco-diff-host {
  min-height: 460px;
}

.monaco-diff-host {
  border: 1px solid var(--app-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--app-bg);
}

.plain-diff {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  pre {
    min-height: 360px;
    max-height: 520px;
    margin: 0;
    padding: 12px;
    overflow: auto;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg);
    color: var(--app-text-primary);
    white-space: pre-wrap;
    line-height: 1.7;
  }
}

@media (max-width: 760px) {
  .diff-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .plain-diff {
    grid-template-columns: 1fr;
  }
}
</style>
