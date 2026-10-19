<script setup lang="ts" vapor>
/**
 * One of a `CtSwipeRow`'s actions, uncovered as the row slides aside: as tall as the row, and
 * wider as it is pulled further. `danger` is the one that takes something away, in the danger's
 * color; otherwise it is in ink.
 */
defineProps<{ danger?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <button
    type="button"
    :disabled
    :data-danger="danger || undefined"
    @click="(e) => emit('click', e)"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
button {
  flex: 1;
  min-inline-size: var(--size-swipe-action);
  padding: 0 var(--space-8);
  border-radius: var(--radius-8);
  background: var(--ink);
  color: var(--on-ink);
  font-size: var(--font-sm);
  font-weight: 700;

  &[data-danger] {
    background: var(--danger);
  }

  &:disabled {
    opacity: 0.35;
  }
}
</style>
