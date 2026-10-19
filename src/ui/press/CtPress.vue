<script setup lang="ts" vapor>
/**
 * Words that open or pick something, pressed where they are written: no box of their own, in the
 * line's own ink and type, a thumb's height to hit (a to-do's title, a slip's). `cover` stretches
 * the press, and its focus ring, over the whole of what it names: the nearest positioned box
 * round it (a CtPaper), so the slip is the button. Everything a button takes (`aria-pressed`,
 * its `click`) is given to it as to a `<button>`.
 */
defineProps<{ cover?: boolean }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <button type="button" :data-cover="cover || undefined" @click="(e) => emit('click', e)">
    <slot></slot>
  </button>
</template>

<style scoped>
button {
  min-height: var(--tap);
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  overflow-wrap: anywhere;

  /* the press is the whole of what it names: its box, and its ring, stretched over it */
  &[data-cover] {
    min-height: 0;

    &::after {
      content: "";
      position: absolute;
      inset: 0;
      /* a paper's corner */
      border-radius: var(--radius-3);
    }

    &:focus-visible {
      outline: none;

      &::after {
        outline: var(--ring-width) solid var(--ink);
        outline-offset: var(--ring-offset);
      }
    }
  }
}
</style>
