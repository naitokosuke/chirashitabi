<script setup lang="ts" generic="V extends string" vapor>
import { nextTick, onMounted, useTemplateRef, watch } from "vue";

import type { CtOption } from "../../types";
import { useIndicator } from "../indicator/useIndicator";

/**
 * Tabs in a row. `variant` says how the chosen one is marked:
 *
 * - `line`: an underline on the row's hairline, under a page's heading.
 * - `pill`: a raised pill in a track, as CtSegmented's, for a row that floats over a view
 *   (on CtGlass, the track is the glass). On a phone a row longer than the screen fades out at
 *   its end, saying it goes on.
 */
const {
  tabs,
  modelValue,
  label,
  variant = "line",
} = defineProps<{
  tabs: readonly CtOption<V>[];
  modelValue: V;
  label: string;
  variant?: "line" | "pill";
}>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();

const list = useTemplateRef<HTMLElement>("list");
const { style, ready } = useIndicator(list, () => [modelValue, tabs.length]);

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
  () => modelValue,
  () => void reveal(true),
);
onMounted(() => void reveal(false));
</script>

<template>
  <div ref="list" role="tablist" :aria-label="label" :data-variant="variant">
    <button
      v-for="t in tabs"
      :key="t.value"
      role="tab"
      type="button"
      :aria-selected="t.value === modelValue"
      @click="() => emit('update:modelValue', t.value)"
    >{{ t.label }}</button>
    <!-- the underline (or the pill) slides and stretches to the selected tab -->
    <span aria-hidden="true" :data-ready="ready || undefined" :style></span>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

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

  /* the tabs over a track, the chosen one on a raised pill under it, as CtSegmented's */
  &[data-variant="pill"] {
    min-width: 0;
    padding: 2px;
    border-block-end: 0;
    border-radius: 999px;
    background: var(--track-bg, var(--wash));
    /* the tabs float over their pill here, and no further */
    isolation: isolate;

    @media (--narrow) {
      padding-inline-end: 20px;
      mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
    }

    > button {
      z-index: var(--z-float);
      min-height: 32px; /* with the track's 2px it is the 36px a thumb is asked to hit */
      padding: 0 14px;
      border-radius: 999px;

      @media (--can-hover) {
        &:not([aria-selected="true"]):hover {
          color: var(--ink);
        }
      }
    }

    > span {
      border: 0;
      border-radius: 999px;
      background: var(--surface);
      box-shadow:
        var(--shadow-tool),
        0 0 0 1px var(--line);
    }
  }
}
</style>
