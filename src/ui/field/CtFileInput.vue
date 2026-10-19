<script setup lang="ts" vapor>
/**
 * A file to pick (a photo): the browser's own control in a CtInput's box, its button one of
 * ours, a pill on the desk's color. Everything a file input takes (`id`, `accept`, `disabled`,
 * its `change`) is given to it as to an `<input type="file">`; what was picked is read from the
 * change, as from the browser's own.
 */
</script>

<template>
  <input type="file" />
</template>

<style scoped>
input {
  width: 100%;
  min-height: var(--size-field);
  padding: var(--space-4);
  border: var(--line-width) solid var(--line);
  border-radius: var(--radius-5);
  background: var(--field-bg, var(--surface));
  color: var(--muted);
  font: inherit;
  font-size: var(--font-sm);

  &:disabled {
    opacity: 0.35;
  }

  &::file-selector-button {
    margin-inline-end: var(--space-5);
    min-height: var(--size-inset-control);
    padding: 0 var(--space-6);
    border: var(--line-width) solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
  }
}
</style>
