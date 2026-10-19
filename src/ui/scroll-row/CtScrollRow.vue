<script setup lang="ts" vapor>
/**
 * A single row that scrolls sideways and fades at its end, so a row that keeps going says so:
 * chips, tags, slips of paper. What is in it is the slot's; `as="ul"` makes the row a list
 * (the slot then gives `li`s). It grows to the width it is given.
 *
 * `inset` starts the row at a view's edge margin (16px), for a row floating along the top of
 * a view. Otherwise it starts where its box does, and keeps a little room round what is in it
 * for a shadow or a focus ring that scrolling would cut off, taken back out of its margin so
 * the row sits where its box is.
 */
const { as = "div" } = defineProps<{ as?: "div" | "ul"; inset?: boolean }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <ul v-if="as === 'ul'" :data-inset="inset || undefined"><slot></slot></ul>
  <div v-else :data-inset="inset || undefined"><slot></slot></div>
</template>

<style scoped>
div,
ul {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  margin: -4px 0 -8px -4px;
  padding: 4px 28px 8px 4px;
  list-style: none;
  mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);

  &::-webkit-scrollbar {
    display: none;
  }

  &[data-inset] {
    margin-inline-start: 0;
    padding-inline-start: 16px;
  }
}
</style>
