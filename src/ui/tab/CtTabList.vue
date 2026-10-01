<script setup lang="ts" vapor>
import { useTemplateRef } from "vue";
import { useIndicator } from "../indicator/indicator";
import type { CtOption } from "../types";

const props = defineProps<{ tabs: readonly CtOption[]; modelValue: string; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const list = useTemplateRef<HTMLElement>("list");
const { style, ready } = useIndicator(list, () => [props.modelValue, props.tabs.length]);
</script>

<template>
  <div ref="list" class="ct-tab-list" role="tablist" :aria-label="label">
    <button
      v-for="t in tabs"
      :key="t.value"
      role="tab"
      type="button"
      :aria-selected="t.value === modelValue"
      @click="() => emit('update:modelValue', t.value)"
    >{{ t.label }}</button>
    <!-- the underline slides and stretches to the selected tab -->
    <span aria-hidden="true" class="indicator" :class="{ ready }" :style="style"></span>
  </div>
</template>

<style scoped>
.ct-tab-list {
  position: relative;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  border-block-end: 1px solid var(--line);

  &::-webkit-scrollbar {
    display: none;
  }
}

button {
  position: relative;
  flex-shrink: 0;
  padding: 10px 14px;
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
  transition: color var(--duration-swap) ease;

  &[aria-selected="true"] {
    color: var(--ink);
  }
}
/* height comes from the tab; only its bottom 2px is drawn */
.indicator {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  border-block-end: 2px solid var(--red);
  pointer-events: none;

  &.ready {
    transition: transform var(--duration-morph) var(--ease-morph),
      width var(--duration-morph) var(--ease-morph);
  }
}
</style>
