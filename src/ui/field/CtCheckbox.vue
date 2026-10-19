<script setup lang="ts" vapor>
/**
 * A box to tick: the browser's own, in ink (on paper, the paper's), at a size a thumb finds.
 * `v-model` is whether it is ticked. Its name is the label it sits in, or `aria-label`.
 */
const model = defineModel<boolean>({ default: false });
</script>

<template>
  <input v-model="model" type="checkbox" />
</template>

<style scoped>
input {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin: 0;
  accent-color: var(--ink);
}
</style>
