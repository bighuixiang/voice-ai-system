<template>
  <section class="context-panel" aria-label="当前创作上下文">
    <div class="panel-title">创作方法</div>
    <dl v-if="project">
      <dt>作品</dt>
      <dd>{{ project.title }}</dd>
      <dt>题材</dt>
      <dd>{{ project.genre || "未设置" }}</dd>
      <dt>章节</dt>
      <dd>{{ chapter?.title || "未选择" }}</dd>
      <dt>场景</dt>
      <dd>小说创作</dd>
      <dt>执行器</dt>
      <dd>{{ aiSummary || "Codex CLI / 默认配置" }}</dd>
    </dl>
    <div class="agent-status" :class="{ available: aiAvailable, unavailable: aiAvailable === false }">
      {{ aiStatus || "可在顶部 AI 配置中校验当前模型与连通性。" }}
    </div>

    <section class="method-card">
      <div class="section-title">质量优先级</div>
      <ul class="priority-list">
        <li>先保证因果、动机与叙事视角诚实，再谈文采润色。</li>
        <li>每章都要落下一个明确变化、一个可见代价、一个向前钩子。</li>
        <li>用 AI 强化场景推进和选择压力，不用它灌水补空白。</li>
      </ul>
    </section>

    <section v-if="activeSkills?.length" class="method-card">
      <div class="section-title">已启用技能</div>
      <div class="skill-list">
        <article v-for="skill in activeSkills" :key="skill.id" class="skill-item">
          <strong>{{ skill.name }}</strong>
          <p>{{ skill.description }}</p>
        </article>
      </div>
    </section>

    <div class="context-note">任务会自动注入故事圣经、章节记忆、创作规则与已启用的小说技能，再进入生成流程。</div>
  </section>
</template>

<script setup lang="ts">
import type { NovelChapter, NovelProject, SkillEntry } from "@/types/novel";

defineProps<{
  project: NovelProject | null;
  chapter: NovelChapter | null;
  aiSummary?: string;
  aiStatus?: string;
  aiAvailable?: boolean;
  activeSkills?: SkillEntry[];
}>();
</script>

<style scoped lang="scss">
.context-panel {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
}

.panel-title {
  color: var(--app-text-primary);
  font-weight: 700;
  margin-bottom: 10px;
}

dl {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 10px;
  margin: 0;
}

dt {
  color: var(--app-text-muted);
}

dd {
  margin: 0;
  color: var(--app-text-primary);
}

.agent-status {
  min-height: 24px;
  margin-top: 12px;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg-soft);
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.3;

  &.available {
    border-color: rgba(34, 197, 94, 0.35);
    background: rgba(34, 197, 94, 0.12);
    color: var(--app-success);
  }

  &.unavailable {
    border-color: rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.12);
    color: var(--app-danger);
  }
}

.method-card {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);
}

.section-title {
  margin-bottom: 8px;
  color: var(--app-text-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.priority-list {
  margin: 0;
  padding-left: 18px;
  color: var(--app-text-secondary);
  line-height: 1.6;
}

.skill-list {
  display: grid;
  gap: 8px;
}

.skill-item {
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
}

.skill-item strong {
  display: block;
  margin-bottom: 4px;
  color: var(--app-text-primary);
  font-size: 13px;
}

.skill-item p {
  margin: 0;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.context-note {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
  color: var(--app-text-secondary);
  line-height: 1.6;
}
</style>
