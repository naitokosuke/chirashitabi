<script setup lang="ts" vapor>
import { useTemplateRef } from "vue";

/**
 * A line to write in: a text box with a hairline edge, at a size a phone does not zoom in on.
 * Everything an input takes (`type`, `id`, `inputmode`, `maxlength`, `required`, its events)
 * is given to it as to an `<input>`; `v-model` holds what is written (`.number` for a count).
 * It sits on the desk; on a raised card, `--field-bg` set to the desk's color sets it into the
 * card. `focus()` puts the caret in it. `size="sm"` is a field tucked into a narrow tab (a
 * time on a slip): a tap's height, its value bold and centered in figures of one width, and no
 * clock glyph to crowd them. On paper (.on-paper) its edge and fill are the paper's.
 */
const { size = "md" } = defineProps<{ size?: "md" | "sm" }>();
const model = defineModel<string | number>({ required: true });

const el = useTemplateRef<HTMLInputElement>("el");
defineExpose({ focus: () => el.value?.focus() });
</script>

<template>
  <input ref="el" v-model="model" :class="`size-${size}`" />
</template>

<style scoped>
input {
  min-width: 0;
  min-height: var(--size-field);
  padding: var(--space-5) var(--space-6);
  border: var(--line-width) solid var(--line);
  border-radius: var(--radius-5);
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

  &.size-sm {
    width: 100%;
    min-height: var(--tap);
    padding: var(--space-2);
    font-size: var(--font-md);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;

    &::-webkit-calendar-picker-indicator {
      display: none;
    }
  }
}
</style>
