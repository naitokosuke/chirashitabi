<script setup lang="ts" vapor>
/**
 * A sum: its figure in bold, in figures of one width, with what it is (`label`) small before it
 * and what else it would come to (`aside`, with the maybes) small and quiet after it. `size`
 * is how much it is the point: `lg` heads a page (a trip's budget), `md` closes a part (a
 * day's total). Where it sits and which way it is aligned are the owner's.
 */
const { size = "md" } = defineProps<{
  value: string;
  label?: string;
  aside?: string;
  size?: "md" | "lg";
}>();
</script>

<template>
  <p class="amount" :data-size="size">
    <small v-if="label !== undefined" class="label">{{ label }}</small>{{
      value
    }}<small v-if="aside !== undefined" class="aside">{{ aside }}</small>
  </p>
</template>

<style scoped>
:where(.amount) {
  margin: 0;
}

.amount {
  font-size: var(--font-md);
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  &[data-size="lg"] {
    font-size: var(--font-4xl);
  }

  > small {
    font-size: var(--font-sm);
  }

  > .label {
    margin-inline-end: var(--space-4);
  }

  > .aside {
    margin-inline-start: var(--space-4);
    font-weight: 400;
    color: var(--muted);
  }
}
</style>
