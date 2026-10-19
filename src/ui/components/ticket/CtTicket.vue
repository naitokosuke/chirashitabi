<script setup lang="ts" vapor>
import { useSlots } from "vue";

import CtPanel from "../panel/CtPanel.vue";

/**
 * A strip of ticket on a panel: a small line above (what it is in ink, then `detail`, and
 * `aside` at its end, such as when), what it is for in the slot, set large and bold (a route,
 * a place's name), and anything else under it in `below` (the way there).
 */
defineProps<{ label: string; detail?: string; aside?: string }>();
defineSlots<{ default(): unknown; below?(): unknown }>();
const slots = useSlots();
</script>

<template>
  <CtPanel class="ticket" pad="md">
    <p>
      <b>{{ label }}</b>
      <span v-if="detail !== undefined && detail !== ''">{{ detail }}</span>
      <small v-if="aside !== undefined">{{ aside }}</small>
    </p>
    <div class="main"><slot></slot></div>
    <slot v-if="slots.below !== undefined" name="below"></slot>
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

.main {
  font-size: var(--font-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
</style>
