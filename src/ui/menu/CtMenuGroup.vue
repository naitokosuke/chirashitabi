<script setup lang="ts" vapor>
/**
 * Things picked in a `CtMenu` (a card's day: CtChips), on a row of their own above its
 * actions, a hairline under them. `label` names the group.
 */
defineProps<{ label: string }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <div role="group" :aria-label="label"><slot></slot></div>
</template>

<style scoped>
div {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-block-end: var(--space-2);
  border-block-end: var(--line-width) solid var(--line);
  font-variant-numeric: tabular-nums;
}
</style>
