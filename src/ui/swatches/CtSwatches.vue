<script setup lang="ts" generic="C extends string" vapor>
import { useTemplateRef } from "vue";

import CtIndicator, { useIndicator } from "../indicator/CtIndicator.vue";

/**
 * Colors to pick one of: a row of them, the chosen one ringed in ink (CtIndicator, hollow, a step
 * out). Picking another, the ring stretches across to it and contracts around it.
 */
const props = defineProps<{ colors: readonly C[]; modelValue: C; label: string }>();
const emit = defineEmits<{ "update:modelValue": [color: C] }>();

const root = useTemplateRef<HTMLElement>("root");
const { chosen, ready } = useIndicator(root, () => [props.modelValue, props.colors.length]);
</script>

<template>
  <div ref="root" class="swatches" role="radiogroup" :aria-label="label">
    <CtIndicator :box="chosen" look="ring" :pad="4" :ready />
    <button
      v-for="(c, i) in colors"
      :key="c"
      role="radio"
      type="button"
      :aria-checked="c === modelValue"
      :aria-label="`${label} ${i + 1}`"
      :style="`--swatch: ${c}`"
      @click="() => emit('update:modelValue', c)"
    ></button>
  </div>
</template>

<style scoped>
@import "../styles/media.css";

.swatches {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-7);

  /* the color itself */
  > button {
    width: var(--tap);
    height: var(--tap);
    padding: 0;
    border-radius: 50%;
    border: 0;
    background: var(--swatch);

    &:focus-visible {
      outline: var(--ring-width) solid var(--ink);
      outline-offset: var(--space-4);
    }
  }
}
</style>
