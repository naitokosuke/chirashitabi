<script setup lang="ts" generic="V extends string" vapor>
import { computed, useTemplateRef } from "vue";

import { useIndicator } from "../../composables/useIndicator";
import type { CtOption } from "../../types";
import CtPill from "../pill/CtPill.vue";

/**
 * A few options in a track, one chosen, a pale pill under it (CtPill), which stretches to
 * the next one picked like rubber.
 */
const props = defineProps<{ options: readonly CtOption<V>[]; modelValue: V; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();

const list = useTemplateRef<HTMLElement>("list");
const { box, ready } = useIndicator(list, () => [props.modelValue, props.options.length]);
const chosen = computed(() => (box.value.width === 0 ? null : box.value));
</script>

<template>
  <div ref="list" role="radiogroup" :aria-label="label">
    <CtPill :box="chosen" look="surface" :ready />
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
