<script setup lang="ts" vapor>
/**
 * One of a few, picked from the browser's own list: a CtInput's box with the options in its
 * slot (`<option>`s). `v-model` holds the value picked, as the option's value says it (a string;
 * the owner reads a number from it where it means one). `size="sm"` is a quieter one tucked
 * into a narrow tab under a CtInput size="sm" (how long a slip's plan takes): a tap's height,
 * small and bold, centered. On paper (data-paper) its edge and fill are the paper's.
 */
const { size = "md" } = defineProps<{ size?: "md" | "sm" }>();
const model = defineModel<string>({ default: "" });
defineSlots<{ default(): unknown }>();
</script>

<template>
  <select v-model="model" :data-size="size"><slot></slot></select>
</template>

<style scoped>
select {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--field-bg, var(--surface));
  color: var(--ink);
  font: inherit;
  font-size: var(--font-lg);

  &:disabled {
    opacity: 0.35;
  }

  &[data-size="sm"] {
    min-height: var(--tap);
    padding: 2px;
    font-size: var(--font-xs);
    font-weight: 700;
    text-align: center;
  }
}
</style>
