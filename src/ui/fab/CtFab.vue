<script setup lang="ts" vapor>
/**
 * The filled tool on a view: an ink tile at the bottom end, in the thumb's reach.
 * `label` names it for screen readers; the slot is its glyph. `disabled` fades the tile while
 * what it set going is under way (a sticker being cut); `aria-busy` is the owner's to add.
 */
defineProps<{ label: string; disabled?: boolean }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <button type="button" :aria-label="label" :disabled @click="(e) => emit('click', e)">
    <slot></slot>
  </button>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

button {
  position: absolute;
  inset-inline-end: var(--space-8);
  /* above the dock's footprint, at the bottom end of the view */
  inset-block-end: calc(var(--dock-clear) + var(--space-8));
  z-index: var(--z-chrome);
  width: var(--size-fab);
  height: var(--size-fab);
  border-radius: var(--radius-9);
  background: var(--ink);
  color: var(--on-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-float);
  transition: box-shadow var(--duration-swap) ease,
    transform var(--duration-swap) var(--ease-morph);

  &:disabled {
    opacity: 0.5;
  }

  @media (--can-hover) {
    &:not(:disabled):hover {
      box-shadow: var(--shadow-lift);
    }
  }
}
</style>
