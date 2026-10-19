<script setup lang="ts" vapor>
/** A thin line between kinds of dock item: places, then settings */
</script>

<template>
  <span aria-hidden="true"></span>
</template>

<style scoped>
span {
  flex-shrink: 0;
  width: var(--line-width);
  height: var(--size-divider);
  margin-inline: var(--space-3);
  background: var(--line);
}
</style>
