<script setup lang="ts" vapor>
/**
 * Something the person is told: that a room did not answer, that a change will take notes off
 * their day. In ink, with room on its line for what to do about it (a CtButton in the slot).
 * `boxed` sets it on a panel of its own, for a message that stands apart from what is round it.
 * `danger` says it in the danger ink, for a call that did not go through where trying again is
 * the button's own tap. Its `role` (`status`, `alert`) and `aria-live` are the owner's.
 */
defineProps<{ boxed?: boolean; danger?: boolean }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <p :class="{ boxed, danger }"><slot /></p>
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
  gap: var(--space-3) var(--space-6);
  font-size: var(--font-sm);
  color: var(--ink);

  &.danger {
    color: var(--danger);
  }

  &.boxed {
    padding: var(--space-6) var(--space-7);
    border-radius: var(--radius-7);
    background: var(--surface);
    box-shadow: inset 0 0 0 var(--line-width) var(--line);
    font-size: var(--font-md);
  }
}
</style>
