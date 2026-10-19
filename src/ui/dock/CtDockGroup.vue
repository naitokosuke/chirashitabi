<script setup lang="ts" vapor>
/**
 * Dock items that belong together and come and go together: closed, the group folds to
 * nothing, divider and all, and the dock shrinks around it; opened, it unfolds and the dock
 * grows. Folded items are inert. The icons inside may still grow upward out of the glass.
 */
defineProps<{ open: boolean }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <div :data-closed="open ? undefined : ''" :inert="!open">
    <div><slot></slot></div>
  </div>
</template>

<style scoped>
@import "../styles/media.css";

/* the column animates from nothing to its content's width (0fr to 1fr) */
div:has(> div) {
  display: grid;
  grid-template-columns: 1fr;
  align-self: stretch;
  opacity: 1;
  transition:
    grid-template-columns var(--duration-morph) var(--ease-morph),
    opacity var(--duration-swap) ease;

  &[data-closed] {
    grid-template-columns: 0fr;
    opacity: 0;
  }

  > div {
    display: flex;
    align-items: center;
    min-width: 0;
    /* cut at the sides while folding; open above, for an icon that grows */
    overflow-x: clip;
    overflow-y: visible;

    /* the divider that leads the group, folding with it */
    &::before {
      content: "";
      flex-shrink: 0;
      width: 1px;
      height: 28px;
      margin-inline: 6px;
      background: var(--line);
    }
  }
}
</style>
