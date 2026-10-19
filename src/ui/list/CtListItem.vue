<script setup lang="ts" vapor>
/**
 * A row of a list on a panel (a CtPanel `as="ul"` `pad="none"`), a hairline between rows:
 * what it is first (`start`, a face), its `title` and the short `notes` beside it (a role,
 * "you", until when), and what can be done to it at its end (`end`). `faded` is a row that is
 * on its way out (a deleted trip), its title in muted ink.
 */
import { useSlots } from "vue";

defineProps<{ title: string; notes?: readonly string[]; faded?: boolean }>();
defineSlots<{ start?(): unknown; end?(): unknown }>();
const slots = useSlots();
</script>

<template>
  <li :data-faded="faded || undefined">
    <slot name="start"></slot>
    <span class="main">
      <b>{{ title }}</b>
      <small v-for="n in notes" :key="n">{{ n }}</small>
    </span>
    <span v-if="slots.end !== undefined" class="end"><slot name="end"></slot></span>
  </li>
</template>

<style scoped>
li {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-height: var(--size-row);
  padding: var(--space-5) var(--space-7);

  & + li {
    border-block-start: var(--line-width) solid var(--line);
  }

  > .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-4);

    > b {
      min-width: 0;
      overflow-wrap: anywhere;
      font-size: var(--font-md);
    }

    > small {
      font-size: var(--font-xs);
      font-weight: 700;
      color: var(--muted);
    }
  }

  > .end {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  &[data-faded] > .main > b {
    color: var(--muted);
  }
}
</style>
