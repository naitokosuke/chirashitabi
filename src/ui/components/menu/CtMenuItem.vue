<script setup lang="ts" vapor>
/**
 * One thing to do in a `CtMenu`: its words, a wash under a hovering pointer. `danger` is the
 * one that destroys something, in the danger's color.
 */
defineProps<{ danger?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <button
    type="button"
    :disabled
    :data-danger="danger || undefined"
    @click="(e) => emit('click', e)"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
@import "../../styles/media.css";

button {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: var(--font-md);
  font-weight: 700;

  &[data-danger] {
    color: var(--danger);
  }

  &:disabled {
    opacity: 0.35;
  }

  @media (--can-hover) {
    &:not(:disabled):hover {
      background: var(--wash);
    }
  }
}
</style>
