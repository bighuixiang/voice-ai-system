<template>
  <section class="chapter-editor" :class="`mode-${documentKind}`" :aria-label="`${documentLabel}编辑器`">
    <header class="editor-header">
      <div class="editor-title">
        <div class="mode-line">
          <span class="mode-kicker">当前工作面</span>
          <span class="mode-name">{{ documentLabel }}</span>
        </div>
        <h2>{{ chapter?.title || "未选择章节" }}</h2>
        <p>{{ filePath || "选择章节后开始写作" }}</p>
      </div>
      <div class="editor-actions">
        <span class="word-count" aria-label="当前字数">{{ wordCount }} 字</span>
        <span class="save-state" :class="{ dirty: hasUnsavedChanges }">{{ saveStateLabel }}</span>
        <el-button class="save-button" :disabled="!filePath || isSaving" :loading="isSaving" @click="$emit('save')">
          <el-icon><DocumentChecked /></el-icon>
          保存
        </el-button>
      </div>
    </header>

    <div class="document-mode-strip">
        <WorkbenchSegmentedControl
          :model-value="documentKind"
          :options="documentOptions"
          ariaLabel="章节编辑类型"
          compact
          @update:model-value="switchDocument"
        />
    </div>

    <div v-if="!usePlainTextarea" ref="monacoHost" class="monaco-host" :aria-label="`Markdown ${documentLabel}`" />
    <textarea
      v-else
      ref="textareaRef"
      class="editor-textarea"
      :value="content"
      spellcheck="false"
      wrap="soft"
      :aria-label="`Markdown ${documentLabel}`"
      @input="handleInput"
      @keydown="handlePlainKeydown"
      @select="emitSelection"
      @keyup="emitSelection"
      @mouseup="emitSelection"
    />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { DocumentChecked, Notebook, Reading } from "@element-plus/icons-vue";
import WorkbenchSegmentedControl from "@/components/common/WorkbenchSegmentedControl.vue";
import type { ChapterDocumentKind, EditorSelection, EditorSuggestion, EditorSuggestionRequest, NovelChapter } from "@/types/novel";

type MonacoApi = typeof import("monaco-editor/esm/vs/editor/editor.api");
type MonacoEditor = import("monaco-editor").editor.IStandaloneCodeEditor;
type MonacoDisposable = import("monaco-editor").IDisposable;

const props = withDefaults(
  defineProps<{
  chapter: NovelChapter | null;
  documentKind: ChapterDocumentKind;
  documentLabel: string;
  filePath: string;
  content: string;
  hasUnsavedChanges: boolean;
  saveStateLabel: string;
  isSaving: boolean;
  wordCount?: number;
  suggestionProvider?: (input: EditorSuggestionRequest) => Promise<EditorSuggestion | null>;
  }>(),
  {
    wordCount: 0,
    suggestionProvider: undefined
  }
);

const emit = defineEmits<{
  "update:content": [content: string];
  "switch-document": [documentKind: ChapterDocumentKind];
  selection: [selection: EditorSelection | null];
  save: [];
}>();

const documentOptions = [
  {
    value: "content",
    label: "章节正文",
    description: "最终小说文本",
    icon: Reading,
    tone: "blue" as const
  },
  {
    value: "outline",
    label: "章纲设定",
    description: "目标、叙事视角、伏笔",
    icon: Notebook,
    tone: "emerald" as const
  }
];

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const monacoHost = ref<HTMLElement | null>(null);
const usePlainTextarea = ref(shouldUsePlainTextarea());
let monaco: MonacoApi | null = null;
let editor: MonacoEditor | null = null;
let contentDisposable: MonacoDisposable | null = null;
let selectionDisposable: MonacoDisposable | null = null;
let inlineSuggestionDisposable: MonacoDisposable | null = null;
let suppressEditorChange = false;

function switchDocument(value: string) {
  emit("switch-document", value as ChapterDocumentKind);
}

function handleInput(event: Event) {
  emit("update:content", (event.target as HTMLTextAreaElement).value);
}

function isSaveShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s";
}

function handlePlainKeydown(event: KeyboardEvent) {
  if (!isSaveShortcut(event)) return;
  event.preventDefault();
  emit("save");
}

function emitSelection() {
  const textarea = textareaRef.value;
  if (!textarea || !props.filePath) {
    emit("selection", null);
    return;
  }

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    emit("selection", null);
    return;
  }

  const value = textarea.value;
  emit("selection", {
    filePath: props.filePath,
    selectedText: value.slice(start, end),
    beforeText: value.slice(Math.max(0, start - 600), start),
    afterText: value.slice(end, Math.min(value.length, end + 600)),
    start,
    end
  });
}

function shouldUsePlainTextarea() {
  if (typeof window === "undefined" || typeof navigator === "undefined" || typeof navigator.userAgent === "string" && navigator.userAgent.includes("jsdom")) {
    return true;
  }
  const pointerIsCoarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return Boolean(navigator.maxTouchPoints > 0 || pointerIsCoarse);
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

async function initMonacoEditor() {
  if (usePlainTextarea.value || editor || !monacoHost.value) return;
  try {
    monaco = await loadMonaco();
    monaco.editor.defineTheme("plotpilot-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "d7dee8", background: "0b1120" },
        { token: "comment", foreground: "94a3b8" }
      ],
      colors: {
        "editor.background": "#0b1120",
        "editor.foreground": "#d7dee8",
        "editorLineNumber.foreground": "#64748b",
        "editorCursor.foreground": "#38bdf8",
        "editor.selectionBackground": "#2563eb55",
        "editor.inactiveSelectionBackground": "#33415588",
        "editorGhostText.foreground": "#94a3b8",
        "editorGutter.background": "#0b1120",
        "minimap.background": "#0b1120",
        "minimapSlider.background": "#33415555",
        "minimapSlider.hoverBackground": "#47556977",
        "minimapSlider.activeBackground": "#64748b88"
      }
    });

    const activeEditor = monaco.editor.create(monacoHost.value, {
      value: props.content,
      language: "markdown",
      theme: "plotpilot-dark",
      automaticLayout: true,
      fontFamily: '"Microsoft YaHei", "PingFang SC", "Source Han Sans SC", sans-serif',
      fontSize: 16,
      lineHeight: 30,
      minimap: {
        enabled: true,
        side: "right",
        size: "fit",
        maxColumn: 80,
        renderCharacters: false,
        scale: 1,
        showSlider: "mouseover"
      },
      wordWrap: "on",
      wrappingIndent: "same",
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      smoothScrolling: true,
      tabSize: 2,
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      inlineSuggest: {
        enabled: true,
        showToolbar: "never"
      }
    });
    editor = activeEditor;

    contentDisposable = activeEditor.onDidChangeModelContent(() => {
      if (!editor || suppressEditorChange) return;
      emit("update:content", editor.getValue());
    });
    selectionDisposable = activeEditor.onDidChangeCursorSelection(emitMonacoSelection);
    activeEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit("save"));
    registerInlineSuggestions();
  } catch {
    disposeMonacoEditor();
    usePlainTextarea.value = true;
    await nextTick();
  }
}

function registerInlineSuggestions() {
  if (!monaco || inlineSuggestionDisposable) return;
  const monacoApi = monaco;
  inlineSuggestionDisposable = monaco.languages.registerInlineCompletionsProvider("markdown", {
    async provideInlineCompletions(model, position, _context, token) {
      if (!props.suggestionProvider || !props.filePath || token.isCancellationRequested) {
        return { items: [] };
      }
      const offset = model.getOffsetAt(position);
      const beforeText = model.getValue().slice(Math.max(0, offset - 1600), offset);
      const afterText = model.getValue().slice(offset, offset + 800);
      if (beforeText.trim().length < 8) return { items: [] };
      const suggestion = await props.suggestionProvider({
        filePath: props.filePath,
        chapterId: props.chapter?.id,
        documentKind: props.documentKind,
        beforeText,
        afterText
      });
      if (!suggestion?.text || token.isCancellationRequested) return { items: [] };
      return {
        items: [
          {
            insertText: suggestion.text,
            range: new monacoApi.Range(position.lineNumber, position.column, position.lineNumber, position.column)
          }
        ]
      };
    },
    disposeInlineCompletions() {
      // Monaco owns these short-lived completion objects.
    }
  });
}

function emitMonacoSelection() {
  const activeEditor = editor;
  const model = activeEditor?.getModel();
  const selection = activeEditor?.getSelection();
  if (!activeEditor || !model || !selection || selection.isEmpty() || !props.filePath) {
    emit("selection", null);
    return;
  }
  const start = model.getOffsetAt(selection.getStartPosition());
  const end = model.getOffsetAt(selection.getEndPosition());
  const value = model.getValue();
  emit("selection", {
    filePath: props.filePath,
    selectedText: value.slice(start, end),
    beforeText: value.slice(Math.max(0, start - 600), start),
    afterText: value.slice(end, Math.min(value.length, end + 600)),
    start,
    end
  });
}

function syncEditorValue(content: string) {
  if (!editor || editor.getValue() === content) return;
  suppressEditorChange = true;
  editor.setValue(content);
  suppressEditorChange = false;
}

function disposeMonacoEditor() {
  contentDisposable?.dispose();
  selectionDisposable?.dispose();
  inlineSuggestionDisposable?.dispose();
  editor?.dispose();
  contentDisposable = null;
  selectionDisposable = null;
  inlineSuggestionDisposable = null;
  editor = null;
}

onMounted(() => {
  initMonacoEditor();
});

onBeforeUnmount(() => {
  disposeMonacoEditor();
});

watch(
  () => props.content,
  (content) => {
    syncEditorValue(content);
  }
);

watch(
  () => props.documentKind,
  () => {
    if (!monaco || !editor?.getModel()) return;
    monaco.editor.setModelLanguage(editor.getModel()!, "markdown");
  }
);
</script>

<style scoped lang="scss">
.chapter-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg);

  h2 {
    margin: 2px 0;
    color: var(--app-text-primary);
    font-size: 16px;
    line-height: 1.25;
  }

  p {
    margin: 0;
    color: var(--app-text-muted);
    font-size: 12px;
  }
}

.editor-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  h2,
  p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    display: none;
  }
}

.mode-line {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  min-height: 18px;
}

.mode-kicker,
.mode-name {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
}

.mode-kicker {
  display: none;
  padding: 0 7px;
  background: var(--app-bg-muted);
  color: var(--app-text-secondary);
}

.mode-name {
  padding: 0 8px;
  background: var(--app-primary-soft);
  color: var(--app-primary-text);
}

.mode-outline .mode-name {
  background: var(--app-success-soft);
  color: var(--app-success-text);
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex: 0 0 auto;
}

.save-state {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 7px;
  border: 1px solid rgba(34, 197, 94, 0.35);
  border-radius: 6px;
  background: var(--app-success-soft);
  color: var(--app-success-text);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;

  &.dirty {
    border-color: rgba(245, 158, 11, 0.35);
    background: var(--app-warning-soft);
    color: var(--app-warning-text);
  }
}

.word-count {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 7px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 6px;
  background: var(--app-primary-soft);
  color: var(--app-primary-text);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.save-button {
  min-width: 72px;
}

.document-mode-strip {
  padding: 4px 12px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg-soft);
}

.document-mode-strip :deep(.workbench-segmented) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 2px;
}

.document-mode-strip :deep(.segment-option) {
  min-height: 30px;
  padding: 4px 8px;
}

.document-mode-strip :deep(.option-icon) {
  width: 20px;
  height: 20px;
}

.editor-textarea,
.monaco-host {
  box-sizing: border-box;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.monaco-host {
  background: var(--app-bg);
}

.editor-textarea {
  max-width: 100%;
  resize: none;
  border: 0;
  outline: none;
  padding: 22px 28px;
  overflow-x: hidden;
  font-size: 16px;
  line-height: 1.86;
  color: var(--app-text-primary);
  background: var(--app-bg);
  font-family: "Microsoft YaHei", "PingFang SC", "Source Han Sans SC", sans-serif;
}

.editor-textarea:focus {
  box-shadow: inset 0 0 0 2px rgba(56, 189, 248, 0.22);
}

@media (max-width: 760px) {
  .editor-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .editor-actions {
    width: 100%;
    justify-content: space-between;
  }

  .editor-textarea {
    padding: 18px;
  }
}
</style>
