<template>
  <section class="collapsible-panel" :class="{ collapsed }">
    <button class="collapse-toggle" type="button" :aria-expanded="!collapsed" @click="$emit('update:collapsed', !collapsed)">
      <el-icon>
        <ArrowRight v-if="collapsed" />
        <ArrowDown v-else />
      </el-icon>
      <span>{{ title }}</span>
      <small v-if="subtitle">{{ subtitle }}</small>
    </button>
    <div v-show="!collapsed" class="collapse-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowRight } from "@element-plus/icons-vue";

defineProps<{
  title: string;
  subtitle?: string;
  collapsed?: boolean;
}>();

defineEmits<{
  "update:collapsed": [collapsed: boolean];
}>();
</script>

<style scoped lang="scss">
.collapsible-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.collapse-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-text-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 700;
  }

  small {
    margin-left: auto;
    color: var(--app-text-muted);
    font-size: 12px;
    white-space: nowrap;
  }
}

.collapse-body {
  min-width: 0;
}
</style>
