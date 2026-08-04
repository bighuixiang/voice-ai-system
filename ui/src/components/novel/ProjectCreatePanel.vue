<template>
  <section id="project-create-panel" class="project-create" aria-labelledby="project-create-title">
    <div class="intro">
      <p class="eyebrow">小说创作平台</p>
      <h2 id="project-create-title">创建小说项目</h2>
      <p>先建立故事骨架；素材、剧本、图片和视频模块会跟随项目一起扩展。</p>
    </div>

    <el-form class="create-form" label-position="top" @submit.prevent="handleSubmit">
      <el-form-item label="作品名">
        <el-input v-model="title" placeholder="例如：九连山" />
      </el-form-item>
      <el-form-item label="题材">
        <el-select
          v-model="genres"
          class="genre-select"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择题材，可多选"
        >
          <el-option v-for="option in novelGenreOptions" :key="option" :label="option" :value="option" />
        </el-select>
      </el-form-item>
      <el-form-item label="粗略想法">
        <el-input
          v-model="roughIdea"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 10 }"
          placeholder="写下主角、世界、核心矛盾，或你脑子里最先出现的画面。"
        />
      </el-form-item>
      <el-button class="create-button" type="primary" :loading="isLoading" @click="handleSubmit">
        <el-icon><Plus /></el-icon>
        创建并进入工作台
      </el-button>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import { useNovelStore } from "@/stores/novel";
import { formatGenres, novelGenreOptions } from "./genreOptions";

const props = defineProps<{
  starterIdea?: string;
}>();

const store = useNovelStore();
const emit = defineEmits<{
  created: [project: { slug: string }];
}>();
const title = ref("");
const genres = ref<string[]>([]);
const roughIdea = ref("");
const isLoading = ref(false);

watch(
  () => props.starterIdea,
  (idea) => {
    if (!idea?.trim() || roughIdea.value.trim()) return;
    roughIdea.value = idea;
  },
  { immediate: true }
);

async function handleSubmit() {
  if (!roughIdea.value.trim()) {
    ElMessage.warning("先写一点粗略想法。");
    return;
  }

  isLoading.value = true;
  try {
    const project = await store.createProject({
      title: title.value,
      genre: formatGenres(genres.value),
      roughIdea: roughIdea.value
    });
    if (project) {
      emit("created", project);
    }
    ElMessage.success("项目已创建。");
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
.project-create {
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 28px;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.intro {
  margin-bottom: 20px;

  .eyebrow {
    color: var(--app-primary);
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    margin: 0 0 8px;
  }

  h2 {
    font-size: 22px;
    margin: 0 0 8px;
    color: var(--app-text-primary);
  }

  p {
    margin: 0;
    color: var(--app-text-secondary);
  }
}

.create-button {
  width: 100%;
}

.genre-select {
  width: 100%;
}
</style>
