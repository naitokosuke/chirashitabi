<script setup lang="ts" vapor>
import { useTemplateRef } from "vue";

/**
 * A line to write in: a text box with a hairline edge, at a size a phone does not zoom in on.
 * Everything an input takes (`type`, `id`, `inputmode`, `maxlength`, `required`, its events)
 * is given to it as to an `<input>`; `v-model` holds what is written (`.number` for a count).
 * It sits on the desk; on a raised card, `--field-bg` set to the desk's color sets it into the
 * card. `focus()` puts the caret in it.
 */
const model = defineModel<string | number>({ required: true });

const el = useTemplateRef<HTMLInputElement>("el");
defineExpose({ focus: () => el.value?.focus() });
</script>

<template>
  <input ref="el" v-model="model" />
</template>

<style scoped>
input {
  min-width: 0;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--field-bg, var(--surface));
  color: var(--ink);
  font: inherit;
  font-size: var(--font-lg);

  &::placeholder {
    color: var(--muted);
  }

  &:disabled {
    opacity: 0.35;
  }
}
</style>
