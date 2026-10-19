<script setup lang="ts" vapor>
/**
 * One of a few, picked from the browser's own list: a CtInput's box with the options in its
 * slot (`<option>`s). `v-model` holds the value picked, as the option's value says it (a string;
 * the owner reads a number from it where it means one). `size="sm"` is a quieter one tucked
 * into a narrow tab under a CtInput size="sm" (how long a slip's plan takes): a tap's height,
 * small and bold, centered. On paper (.on-paper) its edge and fill are the paper's.
 */
const { size = "md" } = defineProps<{ size?: "md" | "sm" }>();
const model = defineModel<string>({ default: "" });
defineSlots<{ default(): unknown }>();
</script>

<template>
  <select v-model="model" :class="`size-${size}`"><slot /></select>
</template>

<style scoped>
select {
  width: 100%;
  min-height: var(--size-field);
  padding: var(--space-5) var(--space-6);
  border: var(--line-width) solid var(--line);
  border-radius: var(--radius-5);
  background: var(--field-bg, var(--surface));
  color: var(--ink);
  font: inherit;
  font-size: var(--font-lg);

  &:disabled {
    opacity: 0.35;
  }

  &.size-sm {
    min-height: var(--tap);
    padding: var(--space-1);
    font-size: var(--font-xs);
    font-weight: 700;
    text-align: center;
  }
}
</style>
