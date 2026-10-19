<script setup lang="ts" vapor>
/**
 * A line said under or beside something, quietly: what a field waits for, where a place came
 * from, what a button will do. Small, in muted ink, broken where it reads best. `size="sm"` is
 * the same line a step larger, for what stands in a list's place while it is empty, or for what
 * a section says of itself; `md` and `lg` are what an empty view says in its place (no notes
 * on the desk yet, no trips yet). `strong` is a line of facts read at a glance (until when, open
 * when, tags and price): bold, its figures of one width. `danger` says it in the danger's ink,
 * for one that has run late. Live regions and `v-if` are the owner's (`aria-live` falls
 * through to it). On paper, its muted ink is the paper's.
 */
defineProps<{ size?: "xs" | "sm" | "md" | "lg"; strong?: boolean; danger?: boolean }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <p :class="[size === undefined ? undefined : `size-${size}`, { strong, danger }]">
    <slot />
  </p>
</template>

<style scoped>
/* no margin of its own, at no weight, so the owner's margin for it always holds */
:where(p) {
  margin: 0;
}

p {
  font-size: var(--font-xs);
  line-height: 1.6;
  color: var(--muted);
  overflow-wrap: anywhere;
  text-wrap: pretty;

  &.size-sm {
    font-size: var(--font-sm);
  }

  &.size-md {
    font-size: var(--font-md);
  }

  &.size-lg {
    font-size: var(--font-lg);
  }

  &.strong {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  &.danger {
    color: var(--danger);
  }
}
</style>
