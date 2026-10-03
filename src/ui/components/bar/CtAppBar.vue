<script setup lang="ts" vapor>
/**
 * The one row at the top of every view: what the view is about (chips, tabs, a line of text)
 * fills it, and `end` is pinned at its far end, outside anything that scrolls. The row has a
 * fixed height whatever it holds, so moving between views never moves the page under it.
 */
defineSlots<{ default(): unknown; end?(): unknown }>();
</script>

<template>
  <header>
    <div><slot></slot></div>
    <div><slot name="end"></slot></div>
  </header>
</template>

<style scoped>
header {
  flex-shrink: 0;
  position: relative;
  z-index: var(--z-chrome);
  box-sizing: content-box;
  height: var(--bar);
  padding-block-start: env(safe-area-inset-top, 0px);
  display: flex;
  align-items: center;
  background: var(--bg);
  border-block-end: 1px solid var(--line);

  /* what the view is about */
  > div:first-child {
    flex: 1;
    min-width: 0;
    align-self: stretch;
    display: flex;
    align-items: center;
  }

  /* pinned at the end */
  > div:last-child {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-inline-end: 12px;
  }
}
</style>
