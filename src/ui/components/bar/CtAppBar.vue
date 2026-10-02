<script setup lang="ts" vapor>
/**
 * The bar at the top of every view: a title row (title, then actions at the end) over a
 * tools row. Both rows have a fixed height whatever they hold, empty included, so moving
 * between views never moves the page under the bar.
 */
defineSlots<{ title(): unknown; actions?(): unknown; tools?(): unknown }>();
</script>

<template>
  <header class="ct-app-bar">
    <div class="title-row">
      <div class="title"><slot name="title"></slot></div>
      <div class="actions"><slot name="actions"></slot></div>
    </div>
    <div class="tools"><slot name="tools"></slot></div>
  </header>
</template>

<style scoped>
.ct-app-bar {
  flex-shrink: 0;
  position: relative;
  z-index: var(--z-chrome);
  padding-block-start: env(safe-area-inset-top, 0px);
  background: var(--bg);
  border-block-end: 1px solid var(--line);
}

.title-row {
  height: var(--bar-title);
  display: flex;
  align-items: center;
  gap: 12px;
  padding-inline: 16px 12px;
}

.title {
  flex: 1;
  min-width: 0;
  font-size: var(--font-2xl);
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tools {
  height: var(--bar-tools);
  display: flex;
  align-items: center;
}
</style>
