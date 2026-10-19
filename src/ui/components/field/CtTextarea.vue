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
  <textarea ref="el" v-model="model" :data-size="size" :data-dashed="dashed || undefined"></textarea>
</template>

<style scoped>
textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--field-bg, var(--surface));
  color: var(--ink);
  font: inherit;
  font-size: var(--font-lg);
  resize: none;

  &::placeholder {
    color: var(--muted);
  }

  &[data-size="lg"] {
    min-height: 120px;
    padding: 12px;
    font-size: var(--font-xl);
  }

  &[data-dashed] {
    border-style: dashed;
    border-color: color-mix(in oklch, var(--ink) 25%, var(--line));
  }
}
</style>
