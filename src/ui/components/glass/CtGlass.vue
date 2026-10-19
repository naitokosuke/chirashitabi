<script setup lang="ts" vapor>
/**
 * A pill of glass floating over a view, the desk showing through it blurred, holding a control
 * (a CtTabList `pill`, a CtSegmented). The glass is the control's track, so what is in it draws
 * none of its own (`--track-bg`).
 */
defineSlots<{ default(): unknown }>();
</script>

<template>
  <div><slot></slot></div>
</template>

<style scoped>
div {
  --track-bg: transparent;
  display: flex;
  min-width: 0;
  border-radius: 999px;
  background: var(--glass);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow:
    var(--glass-edge),
    var(--shadow-tool);
}
</style>
