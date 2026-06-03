<template>
  <section class="chapter-editor" aria-label="章节正文编辑器">
    <header class="editor-header">
      <div>
        <h2>{{ chapter?.title || "未选择章节" }}</h2>
        <p>{{ filePath || "选择章节后开始写作" }}</p>
      </div>
      <div class="editor-actions">
        <el-tag v-if="hasUnsavedChanges" type="warning">未保存</el-tag>
        <el-button :disabled="!filePath" @click="$emit('save')">
          <el-icon><DocumentChecked /></el-icon>
          保存
        </el-button>
      </div>
    </header>

    <textarea
      ref="textareaRef"
      class="editor-textarea"
      :value="content"
      spellcheck="false"
      aria-label="Markdown 正文"
      @input="handleInput"
      @select="emitSelection"
      @keyup="emitSelection"
      @mouseup="emitSelection"
    />
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { DocumentChecked } from "@element-plus/icons-vue";
import type { EditorSelection, NovelChapter } from "@/types/novel";

const props = defineProps<{
  chapter: NovelChapter | null;
  filePath: string;
  content: string;
  hasUnsavedChanges: boolean;
}>();

const emit = defineEmits<{
  "update:content": [content: string];
  selection: [selection: EditorSelection | null];
  save: [];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

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
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;

  h2 {
    font-size: 18px;
    margin: 0 0 4px;
    color: #111827;
  }

  p {
    margin: 0;
    color: #6b7280;
    font-size: 12px;
  }
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 480px;
  resize: none;
  border: 0;
  outline: none;
  padding: 18px 20px;
  font-size: 16px;
  line-height: 1.8;
  color: #111827;
  background: #fff;
  font-family: "Microsoft YaHei", "PingFang SC", "Source Han Sans SC", sans-serif;
}
</style>
