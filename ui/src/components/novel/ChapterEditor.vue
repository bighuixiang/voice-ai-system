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

    <textarea
      ref="textareaRef"
      class="editor-textarea"
      :value="content"
      spellcheck="false"
      :aria-label="`Markdown ${documentLabel}`"
      @input="handleInput"
      @select="emitSelection"
      @keyup="emitSelection"
      @mouseup="emitSelection"
    />
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { DocumentChecked, Notebook, Reading } from "@element-plus/icons-vue";
import WorkbenchSegmentedControl from "@/components/common/WorkbenchSegmentedControl.vue";
import type { ChapterDocumentKind, EditorSelection, NovelChapter } from "@/types/novel";

const props = defineProps<{
  chapter: NovelChapter | null;
  documentKind: ChapterDocumentKind;
  documentLabel: string;
  filePath: string;
  content: string;
  hasUnsavedChanges: boolean;
  saveStateLabel: string;
  isSaving: boolean;
}>();

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
    description: "目标、POV、伏笔",
    icon: Notebook,
    tone: "emerald" as const
  }
];

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function switchDocument(value: string) {
  emit("switch-document", value as ChapterDocumentKind);
}

function handleInput(event: Event) {
  emit("update:content", (event.target as HTMLTextAreaElement).value);
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
</script>

<style scoped lang="scss">
.chapter-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #edf0f5;
  background: #ffffff;

  h2 {
    margin: 3px 0 4px;
    color: #111827;
    font-size: 20px;
    line-height: 1.25;
  }

  p {
    margin: 0;
    color: #64748b;
    font-size: 12px;
  }
}

.editor-title {
  min-width: 0;

  h2,
  p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.mode-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}

.mode-kicker,
.mode-name {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
}

.mode-kicker {
  padding: 0 7px;
  background: #f1f5f9;
  color: #475569;
}

.mode-name {
  padding: 0 8px;
  background: #eff6ff;
  color: #1d4ed8;
}

.mode-outline .mode-name {
  background: #ecfdf5;
  color: #047857;
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
}

.save-state {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  background: #f0fdf4;
  color: #166534;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;

  &.dirty {
    border-color: #fed7aa;
    background: #fff7ed;
    color: #9a3412;
  }
}

.save-button {
  min-width: 84px;
}

.document-mode-strip {
  padding: 8px 16px 10px;
  border-bottom: 1px solid #edf0f5;
  background: #fbfcfe;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 480px;
  resize: none;
  border: 0;
  outline: none;
  padding: 22px 28px;
  font-size: 16px;
  line-height: 1.86;
  color: #111827;
  background: #ffffff;
  font-family: "Microsoft YaHei", "PingFang SC", "Source Han Sans SC", sans-serif;
}

.editor-textarea:focus {
  box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.16);
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
