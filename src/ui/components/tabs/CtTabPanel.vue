<script setup lang="ts" vapor>
/**
 * The page a tab list shows. To move between tabs, change the content inside `usePageTurn`
 * on the page's scrolling box, with the pieces to lay down one by one marked `data-turn`.
 */
defineSlots<{ default(): unknown }>();
</script>

<template>
  <div role="tabpanel"><slot></slot></div>
</template>
