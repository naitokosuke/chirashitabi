<script setup lang="ts" vapor>
/**
 * A line said under or beside something, quietly: what a field waits for, where a place came
 * from, what a button will do. Small, in muted ink, broken where it reads best. `size="sm"` is
 * the same line a step larger, for what stands in a list's place while it is empty, or for what
 * a section says of itself. Live regions and `v-if` are the owner's (`aria-live` falls through
 * to it).
 */
defineProps<{ size?: "xs" | "sm" }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <p :data-size="size === 'sm' ? 'sm' : undefined"><slot></slot></p>
</template>

<style scoped>
/* no margin of its own, at no weight, so the owner's margin for it always holds */
:where(p) {
  margin: 0;
}

p {
  font-size: var(--font-xs);
  line-height: 1.6;
  color: var(--muted);
  overflow-wrap: anywhere;
  text-wrap: pretty;

  &[data-size="sm"] {
    font-size: var(--font-sm);
  }
}
</style>
