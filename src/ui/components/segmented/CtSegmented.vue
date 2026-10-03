<script setup lang="ts" generic="V extends string" vapor>
import { useTemplateRef } from "vue";

import { useIndicator } from "../../composables/useIndicator";
import type { CtOption } from "../../types";

const props = defineProps<{ options: readonly CtOption<V>[]; modelValue: V; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();

const list = useTemplateRef<HTMLElement>("list");
const { style, ready } = useIndicator(list, () => [props.modelValue, props.options.length]);
</script>

<template>
  <div ref="list" role="radiogroup" :aria-label="label">
    <!-- the chosen option's pill, sliding under the labels -->
    <span aria-hidden="true" :data-ready="ready || undefined" :style></span>
    <button
      v-for="o in options"
      :key="o.value"
      role="radio"
      type="button"
      :aria-checked="o.value === modelValue"
      @click="() => emit('update:modelValue', o.value)"
    >{{ o.label }}</button>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

[role="radiogroup"] {
  position: relative;
  display: flex;
  padding: 2px;
  border-radius: 999px;
  background: var(--wash);

  > span {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--shadow-tool), 0 0 0 1px var(--line);
    pointer-events: none;

    /* placed before it moves: it appears where it belongs instead of sliding in from the corner */
    &[data-ready] {
      transition:
        transform var(--duration-morph) var(--ease-morph),
        width var(--duration-morph) var(--ease-morph);
    }
  }

  > button {
    position: relative;
    min-height: 32px; /* with the track's 2px it is the 36px a thumb is asked to hit */
    padding: 0 12px;
    border-radius: 999px;
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
    transition: color var(--duration-swap) ease;

    &[aria-checked="true"] {
      color: var(--ink);
    }

    @media (--can-hover) {
      &:not([aria-checked="true"]):hover {
        color: var(--ink);
      }
    }
  }
}
</style>
