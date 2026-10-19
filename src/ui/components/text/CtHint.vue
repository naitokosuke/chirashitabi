<script setup lang="ts" vapor>
/**
 * A line said under or beside something, quietly: what a field waits for, where a place came
 * from, what a button will do. Small, in muted ink, broken where it reads best. Live regions
 * and `v-if` are the owner's (`aria-live` falls through to it).
 */
defineSlots<{ default(): unknown }>();
</script>

<template>
  <p><slot></slot></p>
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
}
</style>
