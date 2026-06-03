<template>
  <section class="project-create" aria-labelledby="project-create-title">
    <div class="intro">
      <p class="eyebrow">Novel Codex Workbench</p>
      <h2 id="project-create-title">从一个粗略想法开始</h2>
      <p>先创建故事骨架，再逐步生成故事圣经、大纲、章节和局部润色。</p>
    </div>

    <el-form class="create-form" label-position="top" @submit.prevent="handleSubmit">
      <el-form-item label="作品名">
        <el-input v-model="title" placeholder="例如：九连山" />
      </el-form-item>
      <el-form-item label="题材">
        <el-input v-model="genre" placeholder="玄幻 / 都市 / 科幻 / 悬疑" />
      </el-form-item>
      <el-form-item label="粗略想法">
        <el-input
          v-model="roughIdea"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 10 }"
          placeholder="写下主角、世界、核心矛盾或你脑子里最先出现的画面。"
        />
      </el-form-item>
      <el-button class="create-button" type="primary" :loading="isLoading" @click="handleSubmit">
        <el-icon><Plus /></el-icon>
        创建项目
      </el-button>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import { useNovelStore } from "@/stores/novel";

const store = useNovelStore();
const title = ref("");
const genre = ref("");
const roughIdea = ref("");
const isLoading = ref(false);

async function handleSubmit() {
  if (!roughIdea.value.trim()) {
    ElMessage.warning("先写一点粗略想法。");
    return;
  }

  isLoading.value = true;
  try {
    await store.createProject({
      title: title.value,
      genre: genre.value,
      roughIdea: roughIdea.value
    });
    ElMessage.success("小说项目已创建。");
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
.project-create {
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 32px;
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
}

.intro {
  margin-bottom: 24px;

  .eyebrow {
    color: #2563eb;
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  h2 {
    font-size: 26px;
    margin-bottom: 8px;
    color: #111827;
  }

  p {
    color: #4b5563;
  }
}

.create-button {
  width: 100%;
}
</style>
