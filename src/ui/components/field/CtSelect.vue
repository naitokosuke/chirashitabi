<script setup lang="ts" vapor>
/**
 * One of a few, picked from the browser's own list: a CtInput's box with the options in its
 * slot (`<option>`s). `v-model` holds the value picked, as the option's value says it (a string;
 * the owner reads a number from it where it means one).
 */
const model = defineModel<string>({ default: "" });
defineSlots<{ default(): unknown }>();
</script>

<template>
  <select v-model="model"><slot></slot></select>
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
}
</style>
