<script setup lang="ts" generic="V extends string" vapor>
import { nextTick, onMounted, useTemplateRef, watch } from "vue";

import type { CtOption } from "../../types";
import { useIndicator } from "../indicator/useIndicator";

const props = defineProps<{ tabs: readonly CtOption<V>[]; modelValue: V; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();

const list = useTemplateRef<HTMLElement>("list");
const { style, ready } = useIndicator(list, () => [props.modelValue, props.tabs.length]);

/**
 * A row longer than its box scrolls; the chosen tab is brought into it, so the choice is never
 * off to the side. Only the row scrolls, never the page around it.
 */
async function reveal(smooth: boolean) {
  await nextTick();
  const row = list.value;
  if (row === null) return;
  const tab = row.querySelector<HTMLElement>('[aria-selected="true"]');
  if (tab === null) return;
  const pad = 24;
  const left = tab.offsetLeft - pad;
  const right = tab.offsetLeft + tab.offsetWidth + pad - row.clientWidth;
  const to = left < row.scrollLeft ? left : right > row.scrollLeft ? right : null;
  if (to === null) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollTo({ left: to, behavior: smooth && !reduce ? "smooth" : "auto" });
}
watch(
  () => props.modelValue,
  () => void reveal(true),
);
onMounted(() => void reveal(false));
</script>

<template>
  <div ref="list" role="tablist" :aria-label="label">
    <button
      v-for="t in tabs"
      :key="t.value"
      role="tab"
      type="button"
      :aria-selected="t.value === modelValue"
      @click="() => emit('update:modelValue', t.value)"
    >{{ t.label }}</button>
    <!-- the underline slides and stretches to the selected tab -->
    <span aria-hidden="true" :data-ready="ready || undefined" :style></span>
  </div>
</template>

<style scoped>
[role="tablist"] {
  position: relative;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  border-block-end: 1px solid var(--line);

  &::-webkit-scrollbar {
    display: none;
  }

  > button {
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

  /* as tall as the tab; only its bottom 2px is drawn */
  > span {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    border-block-end: 2px solid var(--ink);
    pointer-events: none;

    &[data-ready] {
      transition:
        transform var(--duration-morph) var(--ease-morph),
        width var(--duration-morph) var(--ease-morph);
    }
  }
}
</style>
