<script setup lang="ts" vapor>
import CtPanel from "../panel/CtPanel.vue";

/**
 * A strip of ticket on a panel: a small line above (what it is in ink, then `detail`, and
 * `aside` at its end, such as when) and what it is for in large type in the slot (a route, a
 * place's name), with anything else under it.
 */
defineProps<{ label: string; detail?: string; aside?: string }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <CtPanel class="ticket" pad="md">
    <p>
      <b>{{ label }}</b>
      <span v-if="detail !== undefined && detail !== ''">{{ detail }}</span>
      <small v-if="aside !== undefined">{{ aside }}</small>
    </p>
    <slot></slot>
  </CtPanel>
</template>

<style scoped>
.ticket {
  display: grid;
  gap: 4px;
  color: var(--ink);

  > p {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0;
    font-size: var(--font-sm);
    color: var(--muted);
    font-variant-numeric: tabular-nums;

    > b {
      color: var(--ink);
    }

    > small {
      margin-inline-start: auto;
      font-size: var(--font-xs);
      font-weight: 700;
    }
  }
}
</style>
