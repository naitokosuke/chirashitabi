<script setup lang="ts" vapor>
/**
 * Something the person is told: that a room did not answer, that a change will take notes off
 * their day. In ink, with room on its line for what to do about it (a CtButton in the slot).
 * `boxed` sets it on a panel of its own, for a message that stands apart from what is round it.
 * Its `role` (`status`, `alert`) is the owner's.
 */
defineProps<{ boxed?: boolean }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <p :data-boxed="boxed || undefined"><slot></slot></p>
</template>

<style scoped>
/* no margin of its own, at no weight, so the owner's margin for it always holds */
:where(p) {
  margin: 0;
}

p {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  font-size: var(--font-sm);
  color: var(--ink);

  &[data-boxed] {
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
    font-size: var(--font-md);
  }
}
</style>
