<script setup lang="ts" generic="V extends string" vapor>
import { useTemplateRef } from "vue";

import CtIndicator, { useIndicator } from "../indicator/CtIndicator.vue";

/**
 * A few options in a track, one chosen, a pale pill under it (CtIndicator), which stretches to
 * the next one picked like rubber.
 */
const props = defineProps<{
  options: readonly { value: V; label: string }[];
  modelValue: V;
  label: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();

const list = useTemplateRef<HTMLElement>("list");
const { chosen, ready } = useIndicator(list, () => [props.modelValue, props.options.length]);
</script>

<template>
  <div ref="list" role="radiogroup" :aria-label="label">
    <CtIndicator :box="chosen" look="surface" :ready />
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
@import "/src/ui/styles/media.css";

[role="radiogroup"] {
  position: relative;
  display: flex;
  padding: var(--space-1);
  border-radius: var(--radius-pill);
  /* the track: a wash of ink, or what it sits on when that is its track (CtGlass) */
  background: var(--track-bg, var(--wash));

  > button {
    position: relative;
    min-height: calc(var(--tap) - 2 * var(--space-1)); /* with the track's padding it is the tap a thumb is asked to hit */
    padding: 0 var(--space-6);
    border-radius: var(--radius-pill);
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
