<script setup lang="ts" vapor>
/**
 * A single row that scrolls sideways and fades at its end, so a row that keeps going says so:
 * chips, tags, slips of paper. What is in it is the slot's; `as="ul"` makes the row a list
 * (the slot then gives `li`s). It grows to the width it is given.
 *
 * `inset` starts the row at a view's edge margin (`--space-8`), for a row floating along the top of
 * a view. Otherwise it starts where its box does, and keeps a little room round what is in it
 * for a shadow or a focus ring that scrolling would cut off, taken back out of its margin so
 * the row sits where its box is.
 */
const { as = "div" } = defineProps<{ as?: "div" | "ul"; inset?: boolean }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <ul v-if="as === 'ul'" :class="{ inset }"><slot /></ul>
  <div v-else :class="{ inset }"><slot /></div>
</template>

<style scoped>
div,
ul {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  overflow-x: auto;
  scrollbar-width: none;
  margin: calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-4)) calc(-1 * var(--space-2));
  padding: var(--space-2) var(--space-14) var(--space-4) var(--space-2);
  list-style: none;
  mask-image: linear-gradient(to right, #000 calc(100% - var(--space-14)), transparent);

  &::-webkit-scrollbar {
    display: none;
  }

  &.inset {
    margin-inline-start: 0;
    padding-inline-start: var(--space-8);
  }
}
</style>
