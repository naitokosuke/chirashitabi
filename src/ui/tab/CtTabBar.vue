<script setup lang="ts" vapor>
import { useTemplateRef } from "vue";
import { useIndicator } from "../indicator/indicator";
import type { CtOption } from "../types";

const props = defineProps<{ items: readonly CtOption[]; modelValue: string; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
defineSlots<{ icon(props: { value: string }): unknown }>();

const list = useTemplateRef<HTMLElement>("list");
const { style, ready } = useIndicator(list, () => [props.modelValue, props.items.length]);
</script>

<template>
  <nav ref="list" class="ct-tab-bar" :aria-label="label">
    <!-- the highlight slides behind whichever item is current -->
    <span aria-hidden="true" class="indicator" :class="{ ready }" :style="style"></span>
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
.ct-tab-bar {
  position: relative;
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  gap: 4px;
}

.indicator {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--red) 12%, var(--surface));
  pointer-events: none;

  &.ready {
    transition: transform var(--duration-morph) var(--ease-morph),
      width var(--duration-morph) var(--ease-morph);
  }
}

button {
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
    color: var(--red);
  }
}
</style>
