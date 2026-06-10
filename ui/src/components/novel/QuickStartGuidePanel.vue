<template>
  <section class="quick-start-guide" :class="`variant-${variant}`" aria-labelledby="quick-start-title">
    <header class="guide-header">
      <div>
        <p class="eyebrow">Quick Start</p>
        <h2 id="quick-start-title">{{ copy.title }}</h2>
        <p>{{ copy.subtitle }}</p>
      </div>
      <el-button v-if="variant === 'hub'" type="primary" @click="$emit('start-create')">
        <el-icon><Position /></el-icon>
        从这里开始
      </el-button>
    </header>

    <ol class="step-list">
      <li v-for="step in steps" :key="step.id" class="step-item" :class="{ done: step.done, active: step.active }">
        <span class="step-index">{{ step.index }}</span>
        <span class="step-copy">
          <strong>{{ step.title }}</strong>
          <small>{{ step.description }}</small>
        </span>
      </li>
    </ol>

    <div class="guide-actions" :aria-label="copy.actionLabel">
      <template v-if="variant === 'hub'">
        <el-button @click="$emit('use-example')">
          <el-icon><EditPen /></el-icon>
          填入示例想法
        </el-button>
        <el-button @click="$emit('start-create')">
          <el-icon><Plus /></el-icon>
          去创建项目
        </el-button>
      </template>
      <template v-else>
        <el-button :type="mode === 'structure' ? 'primary' : 'default'" @click="$emit('open-mode', 'structure')">
          <el-icon><DataAnalysis /></el-icon>
          先搭结构
        </el-button>
        <el-button :type="mode === 'focus' ? 'primary' : 'default'" @click="$emit('open-mode', 'focus')">
          <el-icon><Edit /></el-icon>
          写下一段
        </el-button>
        <el-button :type="mode === 'review' ? 'primary' : 'default'" @click="$emit('open-mode', 'review')">
          <el-icon><Finished /></el-icon>
          审稿润色
        </el-button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DataAnalysis, Edit, EditPen, Finished, Plus, Position } from "@element-plus/icons-vue";
import type { WritingMode } from "@/types/novel";

const props = withDefaults(
  defineProps<{
    variant: "hub" | "workspace";
    mode?: WritingMode;
    hasStructure?: boolean;
    hasDraft?: boolean;
  }>(),
  {
    mode: "structure",
    hasStructure: false,
    hasDraft: false
  }
);

defineEmits<{
  "start-create": [];
  "use-example": [];
  "open-mode": [mode: WritingMode];
}>();

const copy = computed(() =>
  props.variant === "hub"
    ? {
        title: "第一次用？按这条路线走",
        subtitle: "不用先想完整大纲。先写一句核心创意，系统会把它拆成项目、结构、正文和审稿动作。",
        actionLabel: "创建小说引导动作"
      }
    : {
        title: "当前项目下一步",
        subtitle: "结构、正文、审稿是一个循环。卡住时先回到这三步，不需要一次把所有设定补完。",
        actionLabel: "工作区引导动作"
      }
);

const steps = computed(() => {
  if (props.variant === "hub") {
    return [
      {
        id: "idea",
        index: "1",
        title: "写一句粗略想法",
        description: "主角是谁、想要什么、遇到什么阻力，先写清这三件事。",
        done: false,
        active: true
      },
      {
        id: "create",
        index: "2",
        title: "创建小说项目",
        description: "作品名可以之后改，粗略想法越具体，初始设定越好用。",
        done: false,
        active: false
      },
      {
        id: "structure",
        index: "3",
        title: "用想法起结构",
        description: "进入结构模式，生成章节目标、冲突、结尾钩子和场景卡。",
        done: false,
        active: false
      },
      {
        id: "draft",
        index: "4",
        title: "专注写下一段",
        description: "切到专注模式，让 AI 只续写当前章尾，不重写整章。",
        done: false,
        active: false
      },
      {
        id: "review",
        index: "5",
        title: "审稿、润色、保存",
        description: "选中文本做润色，或跑章节质检，再把可用结果写回正文。",
        done: false,
        active: false
      }
    ];
  }

  return [
    {
      id: "structure",
      index: "1",
      title: "先搭结构",
      description: "用一句想法生成本章目标、冲突和场景卡；写完正文也能反写结构。",
      done: props.hasStructure,
      active: props.mode === "structure"
    },
    {
      id: "draft",
      index: "2",
      title: "再写正文",
      description: "专注模式会根据章纲和场景卡提示下一笔，适合从空白处继续推进。",
      done: props.hasDraft,
      active: props.mode === "focus"
    },
    {
      id: "review",
      index: "3",
      title: "最后审稿",
      description: "正文有基础后，切到审稿模式做选区润色、质量诊断和账本确认。",
      done: false,
      active: props.mode === "review"
    }
  ];
});
</script>

<style scoped lang="scss">
.quick-start-guide {
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.guide-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;

  h2 {
    margin: 0 0 5px;
    font-size: 18px;
    color: var(--app-text-primary);
  }

  p {
    margin: 0;
    color: var(--app-text-secondary);
    font-size: 13px;
    line-height: 1.55;
  }
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.step-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.variant-workspace .step-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.step-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  min-height: 86px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);

  &.active {
    border-color: var(--app-primary);
    background: var(--app-primary-soft);
  }

  &.done {
    border-color: rgba(34, 197, 94, 0.5);
    background: var(--app-success-soft);
  }
}

.step-index {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--app-primary);
  color: var(--app-bg);
  font-size: 12px;
  font-weight: 800;
}

.step-copy {
  min-width: 0;

  strong,
  small {
    display: block;
  }

  strong {
    margin-bottom: 4px;
    color: var(--app-text-primary);
    font-size: 13px;
  }

  small {
    color: var(--app-text-muted);
    font-size: 12px;
    line-height: 1.45;
  }
}

.guide-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

@media (max-width: 1000px) {
  .step-list,
  .variant-workspace .step-list {
    grid-template-columns: 1fr;
  }

  .step-item {
    min-height: auto;
  }
}

@media (max-width: 760px) {
  .guide-header {
    flex-direction: column;
  }

  .guide-actions :deep(.el-button) {
    flex: 1 1 150px;
  }
}
</style>
