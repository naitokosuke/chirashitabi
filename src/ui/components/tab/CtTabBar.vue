<script setup lang="ts" generic="V extends string" vapor>
import { useTemplateRef } from "vue";

import { useIndicator } from "../../composables/useIndicator";
import type { CtOption } from "../../types";

const props = defineProps<{ items: readonly CtOption<V>[]; modelValue: V; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();
defineSlots<{ icon(props: { value: V }): unknown }>();

const list = useTemplateRef<HTMLElement>("list");
const { style, ready } = useIndicator(list, () => [props.modelValue, props.items.length]);
</script>

<template>
  <nav ref="list" :aria-label="label">
    <!-- the highlight slides behind whichever item is current -->
    <span aria-hidden="true" :data-ready="ready || undefined" :style></span>
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :aria-current="item.value === modelValue ? 'page' : undefined"
      @click="() => emit('update:modelValue', item.value)"
    >
      <slot name="icon" :value="item.value"></slot>
      {{ item.label }}
    </button>
  </nav>
</template>

<style scoped>
@import "../../styles/media.css";
nav {
  position: relative;
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  gap: 4px;
  > span {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    border-radius: 12px;
    background: var(--wash);
    pointer-events: none;
    &[data-ready] {
      transition:
        transform var(--duration-morph) var(--ease-morph),
        width var(--duration-morph) var(--ease-morph);
    }
  }
  > button {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 12px;
    color: var(--muted);
    font-size: var(--font-xs);
    font-weight: 700;
    transition: color var(--duration-swap) ease;
    &[aria-current="page"] {
      color: var(--ink);
    }
    @media (--can-hover) {
      &:not([aria-current="page"]):hover {
        color: var(--ink);
      }
    }
  }
}
</style>
