<template>
  <div class="workbench-segmented" :class="{ compact }" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="option in options"
      :key="option.value"
      class="segment-option"
      :class="[{ active: modelValue === option.value }, option.tone ? `tone-${option.tone}` : 'tone-blue']"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      @click="selectOption(option.value)"
    >
      <span v-if="option.icon" class="option-icon" aria-hidden="true">
        <el-icon><component :is="option.icon" /></el-icon>
      </span>
      <span class="option-copy">
        <strong>{{ option.label }}</strong>
        <small v-if="option.description">{{ option.description }}</small>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";

export interface WorkbenchSegmentedOption {
  value: string;
  label: string;
  description?: string;
  icon?: Component;
  tone?: "blue" | "emerald" | "slate";
}

const props = defineProps<{
  modelValue: string;
  options: WorkbenchSegmentedOption[];
  ariaLabel: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function selectOption(value: string) {
  if (value !== props.modelValue) {
    emit("update:modelValue", value);
  }
}
</script>

<style scoped lang="scss">
.workbench-segmented {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  width: 100%;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg-soft);
}

.segment-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 52px;
  padding: 9px 11px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  text-align: left;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease;

  &:hover {
    background: var(--app-bg);
    border-color: var(--app-border-soft);
  }

  &:focus-visible {
    outline: 2px solid var(--app-primary);
    outline-offset: 2px;
  }

  &.active {
    background: var(--app-bg);
    border-color: var(--app-primary);
    color: var(--app-primary-text);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
  }

  &.active::before {
    position: absolute;
    inset: 8px auto 8px 0;
    width: 3px;
    border-radius: 999px;
    background: var(--app-primary);
    content: "";
  }

  &.tone-emerald.active {
    border-color: #059669;
    color: #047857;
  }

  &.tone-emerald.active::before {
    background: #059669;
  }

  &.tone-slate.active {
    border-color: #475569;
    color: #334155;
  }

  &.tone-slate.active::before {
    background: #475569;
  }
}

.option-icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--app-bg-muted);
  color: currentColor;

  .el-icon {
    font-size: 17px;
  }
}

.segment-option.active .option-icon {
  background: currentColor;
  color: var(--app-bg);
}

.option-copy {
  display: grid;
  gap: 2px;
  min-width: 0;

  strong {
    overflow: hidden;
    font-size: 13px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    overflow: hidden;
    color: var(--app-text-muted);
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.compact {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 4px;
  padding: 3px;

  .segment-option {
    min-height: 36px;
    padding: 6px 8px;
  }

  .option-icon {
    width: 24px;
    height: 24px;
  }

  .option-copy small {
    display: none;
  }
}
</style>
