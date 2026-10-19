<script setup lang="ts" vapor>
import { useTemplateRef } from "vue";

/**
 * Lines to write in, a CtInput's box grown tall: at a size a phone does not zoom in on, never
 * resized by hand. `size` `lg` is the note itself, the main thing a form is for, in larger
 * words with room for several lines. `dashed` is a place still blank on a page (a day's
 * line), its edge dashed. Everything a textarea takes (`rows`, `id`, its events) is given to
 * it as to a `<textarea>`; `v-model` holds the words. `focus()` puts the caret in it.
 */
const { size = "md" } = defineProps<{ size?: "md" | "lg"; dashed?: boolean }>();
const model = defineModel<string>({ default: "" });

const el = useTemplateRef<HTMLTextAreaElement>("el");
defineExpose({ focus: () => el.value?.focus() });
</script>

<template>
  <textarea ref="el" v-model="model" :class="[`size-${size}`, { dashed }]"></textarea>
</template>

<style scoped>
textarea {
  width: 100%;
  padding: var(--space-5) var(--space-6);
  border: var(--line-width) solid var(--line);
  border-radius: var(--radius-5);
  background: var(--field-bg, var(--surface));
  color: var(--ink);
  font: inherit;
  font-size: var(--font-lg);
  resize: none;

  &::placeholder {
    color: var(--muted);
  }

  &.size-lg {
    min-height: var(--size-textarea-lg);
    padding: var(--space-6);
    font-size: var(--font-xl);
  }

  &.dashed {
    border-style: dashed;
    border-color: color-mix(in oklch, var(--ink) 25%, var(--line));
  }
}
</style>
