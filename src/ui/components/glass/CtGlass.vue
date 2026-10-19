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
  backdrop-filter: blur(16px) saturate(1.5);
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
  box-shadow:
    inset 0 0 0 1px color-mix(in oklch, var(--line) 80%, transparent),
    var(--shadow-tool);
}
</style>
