<script setup lang="ts" vapor>
/**
 * A word that a write went through, in ink over everything: what was done, and at its end what
 * to do about it (a CtButton variant="text" in `action`, such as an undo). Where it floats is the
 * owner's; it is only the bubble. Its live region is the owner's too, kept on the page while the
 * bubble comes and goes.
 */
defineSlots<{ default(): unknown; action?(): unknown }>();
</script>

<template>
  <div class="toast">
    <span><slot></slot></span>
    <slot name="action"></slot>
  </div>
</template>

<style scoped>
.toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-7);
  border-radius: var(--radius-7);
  background: var(--ink);
  color: var(--on-ink);
  font-size: var(--font-md);
  font-weight: 700;
  box-shadow: var(--shadow-float);

  /* the action is the toast's own ink, told apart by its underline, not by a color */
  > :not(span) {
    flex-shrink: 0;
  }
}
</style>
