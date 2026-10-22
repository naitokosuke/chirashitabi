<script setup lang="ts" vapor>
import { onMounted, ref, useTemplateRef } from "vue";

import { useI18n } from "../../i18n/useI18n";

/**
 * Words being written straight on the desk: where a double click landed, or over a text box
 * being rewritten (which is hidden meanwhile). It sits in desk coordinates, turned and sized
 * like the box, and grows with what is typed. Enter or leaving it is done; Shift+Enter starts a
 * new line; Escape gives up. Done says once what was written, or null for giving up.
 */
const props = defineProps<{ x: number; y: number; rot: number; scale: number; text: string }>();
const emit = defineEmits<{ done: [text: string | null] }>();
const i18n = useI18n();

const value = ref(props.text);
const field = useTemplateRef<HTMLTextAreaElement>("field");
let finished = false;
function finish(text: string | null) {
  if (finished) return;
  finished = true;
  emit("done", text);
}
function onKey(e: KeyboardEvent) {
  // an IME's Enter picks a word; only a plain one is done (Safari sends the Enter that confirms
  // it after compositionend, no longer composing, but with keyCode 229)
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    finish(value.value);
  } else if (e.key === "Escape") {
    e.preventDefault();
    finish(null);
  }
}
const onBlur = () => finish(value.value);

onMounted(() => {
  const f = field.value;
  if (f === null) return;
  // the caret after the last word, as when picking up a pen where the line ends
  f.focus({ preventScroll: true });
  f.setSelectionRange(f.value.length, f.value.length);
});
</script>

<template>
  <div
    class="text-field"
    :data-value="value"
    :style="`--x: ${x}px; --y: ${y}px; --rot: ${rot}deg; --scale: ${scale}`"
  >
    <textarea
      ref="field"
      v-model="value"
      :aria-label="i18n.t('canvas.text')"
      maxlength="1000"
      rows="1"
      spellcheck="false"
      @blur="onBlur"
      @keydown="onKey"
    ></textarea>
  </div>
</template>

<style scoped>
/*
 * Set like a text box on the desk (NoteCard's text): the same place, turn, size and letters, so
 * nothing moves when writing starts or ends. A hidden copy of the words sizes the box; the field
 * fills it, ruled under while it has the caret.
 */
.text-field {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  z-index: var(--z-float);
  display: grid;
  /* as wide as its longest line (the desk it sits in has no width of its own), up to a point */
  width: max-content;
  min-width: 2em;
  max-width: 560px;
  transform: translate(var(--x), var(--y)) rotate(var(--rot)) scale(var(--scale, 1));
  transform-origin: center;
  font-size: var(--text-box-size);
  font-weight: 700;
  line-height: 1.3;
  color: var(--ink);

  &::after,
  > textarea {
    grid-area: 1 / 1;
    padding: var(--text-box-pad);
    font: inherit;
    letter-spacing: 0.02em;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* the words plus one more line's room for the caret, never shown */
  &::after {
    content: attr(data-value) " ";
    visibility: hidden;
  }

  > textarea {
    width: 100%;
    min-width: 0;
    margin: 0;
    border: 0;
    border-radius: 4px;
    background: color-mix(in oklch, var(--bg) 70%, transparent);
    color: inherit;
    resize: none;
    overflow: hidden;
    caret-color: var(--ink);
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in oklch, var(--ink) 45%, transparent);
  }
}
</style>
