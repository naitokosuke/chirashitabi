<script setup lang="ts" vapor>
/**
 * The one filled tool on a view: an ink tile at the bottom end, in the thumb's reach.
 * `label` names it for screen readers; the slot is its glyph.
 */
defineProps<{ label: string }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <button type="button" :aria-label="label" @click="(e) => emit('click', e)">
    <slot></slot>
  </button>
</template>

<style scoped>
@import "../../styles/media.css";

button {
  position: absolute;
  inset-inline-end: 16px;
  /* above the dock's footprint, at the bottom end of the view */
  inset-block-end: calc(var(--dock-clear) + 16px);
  z-index: var(--z-chrome);
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--ink);
  color: var(--on-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-float);
  transition: box-shadow var(--duration-swap) ease,
    transform var(--duration-swap) var(--ease-morph);

  @media (--can-hover) {
    &:hover {
      box-shadow: var(--shadow-lift);
    }
  }
}
</style>
