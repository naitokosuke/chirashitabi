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
  min-height: 46px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--field-bg, var(--surface));
  color: var(--muted);
  font: inherit;
  font-size: var(--font-sm);

  &:disabled {
    opacity: 0.35;
  }

  &::file-selector-button {
    margin-inline-end: 10px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
  }
}
</style>
