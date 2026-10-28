<script setup lang="ts" vapor>
/**
 * The way back from a sheet: a pill of glass floating at the start of the row where a bar
 * would be, over whatever the sheet holds. The slot is its glyph and the name of where it
 * goes back to.
 */
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <button type="button" @click="(e) => emit('click', e)">
    <slot></slot>
  </button>
</template>

<style scoped>
@import "../styles/media.css";
button {
  position: absolute;
  inset-inline-start: var(--space-6);
  inset-block-start: calc(var(--top-inset) + (var(--top-row) - var(--tap)) / 2);
  z-index: var(--z-chrome);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap);
  padding: 0 var(--space-6) 0 var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--glass);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow:
    var(--glass-edge),
    var(--shadow-tool);
  color: var(--muted);
  font-size: var(--font-sm);
  font-weight: 700;

  @media (--can-hover) {
    &:hover {
      color: var(--ink);
    }
  }
}
</style>
