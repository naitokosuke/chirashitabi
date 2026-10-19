<script setup lang="ts" vapor>
/**
 * Something shown only when asked for: its `label` a quiet, bold line a thumb's height to tap,
 * what it holds (the slot) under it once opened. The browser's own details and summary, so it
 * opens from the keyboard and is read out as one.
 */
defineProps<{ label: string }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <details>
    <summary>{{ label }}</summary>
    <slot></slot>
  </details>
</template>

<style scoped>
summary {
  width: fit-content;
  min-height: var(--tap);
  display: flex;
  align-items: center;
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
}
</style>
