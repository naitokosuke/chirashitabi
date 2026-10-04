<script setup lang="ts" generic="V extends string" vapor>
import { useTemplateRef } from "vue";

import { useIndicator } from "../indicator/useIndicator";
import type { CtOption } from "../../types";
import CtIndicator from "../indicator/CtIndicator.vue";

/**
 * Chips to pick one of (a currency, say): a row of them, the chosen one filled with ink. The
 * ink is a pill behind the chips (CtIndicator), so picking another it stretches across to it and
 * contracts onto it; the chips are open (a hairline, no fill) so the ink shows through on
 * the way, and the chosen one's words turn to the ink's own color.
 */
const props = defineProps<{ options: readonly CtOption<V>[]; modelValue: V; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();

const root = useTemplateRef<HTMLElement>("root");
const { chosen, ready } = useIndicator(root, () => [props.modelValue, props.options.length]);
</script>

<template>
  <div ref="root" class="pick" role="radiogroup" :aria-label="label">
    <CtIndicator :box="chosen" :ready />
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

.pick {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  /* a chip (CtChip) with no fill of its own: the ink behind it is the fill; over the ink */
  > button {
    position: relative;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: transparent;
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
    transition:
      color var(--duration-swap) ease,
      border-color var(--duration-swap) ease;

    @media (--can-hover) {
      &:not([aria-checked="true"]):hover {
        color: var(--ink);
        border-color: color-mix(in oklch, var(--ink) 30%, var(--line));
      }
    }

    &[aria-checked="true"] {
      color: var(--on-ink);
      border-color: transparent;
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
  }
}
</style>
