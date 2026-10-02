<script setup lang="ts" vapor>
/**
 * The page a tab list shows. To morph between tabs, change the tab inside `useViewTransition`
 * with the page's scrolling box named `ct-page` (the box, not this panel: a snapshot is not
 * clipped by its ancestors, so a named panel would spill over the bars while it slides).
 */
defineSlots<{ default(): unknown }>();
</script>

<template>
  <div class="ct-tab-panel" role="tabpanel"><slot></slot></div>
</template>
