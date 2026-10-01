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
  <div ref="list" class="ct-segmented" role="radiogroup" :aria-label="label">
    <span aria-hidden="true" class="indicator" :class="{ ready }" :style="style"></span>
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
.ct-segmented {
  position: relative;
  display: flex;
  padding: 3px;
  border: 1.5px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
}

.indicator {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  border-radius: 999px;
  background: var(--ink);
  pointer-events: none;

  &.ready {
    transition: transform var(--duration-morph) var(--ease-morph),
      width var(--duration-morph) var(--ease-morph);
  }
}

button {
  position: relative;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
  transition: color var(--duration-swap) ease;

  &[aria-checked="true"] {
    color: var(--bg);
  }
}
</style>
