<script setup lang="ts" generic="V extends string" vapor>
import { computed, useTemplateRef } from "vue";

import { useIndicator } from "../../composables/useIndicator";
import type { CtOption } from "../../types";
import CtTarget from "../target/CtTarget.vue";

/**
 * Chips to pick one of (a currency, say): a row of them, the chosen one in ink and framed by
 * a target's four corners (CtTarget). Picking another, the corners fly there and lock on.
 */
const props = defineProps<{ options: readonly CtOption<V>[]; modelValue: V; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();

const root = useTemplateRef<HTMLElement>("root");
const { box, ready } = useIndicator(root, () => [props.modelValue, props.options.length]);
const target = computed(() => (box.value.width === 0 ? null : box.value));
</script>

<template>
  <div ref="root" class="pick" role="radiogroup" :aria-label="label">
    <CtTarget :box="target" :pad="3" :ready />
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
  gap: 10px;

  /* a chip (CtChip), the chosen one in ink; the corners around it are the target's */
  > button {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
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
      color: var(--ink);
      border-color: var(--ink);
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 6px;
    }
  }
}
</style>
