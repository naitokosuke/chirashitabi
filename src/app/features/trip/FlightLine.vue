<script setup lang="ts" vapor>
import { computed } from "vue";

import { useI18n } from "../../i18n/useI18n";

import { longDate } from "./format";
import type { Flight, Leg } from "./types";

/**
 * One flight as a line on a ticket: which way, its number, and from where at what time to where
 * at what time, each in its own airport's local time. The day is said once, or twice when it
 * lands on another day than it leaves.
 */
const props = defineProps<{ leg: Leg; flight: Flight }>();
const i18n = useI18n();

const time = (t: Flight["departs"]) => t.toPlainTime().toString({ smallestUnit: "minute" });
const days = computed(() => {
  const leaves = props.flight.departs.toPlainDate();
  const lands = props.flight.arrives.toPlainDate();
  const from = longDate(leaves, i18n.locale);
  return leaves.equals(lands) ? from : `${from} – ${longDate(lands, i18n.locale)}`;
});
</script>

<template>
  <div class="flight">
    <p class="head">
      <b>{{ i18n.t(leg === "out" ? "flight.out" : "flight.back") }}</b>
      <span v-if="flight.number">{{ flight.number }}</span>
      <small>{{ days }}</small>
    </p>
    <p class="route">
      <span><b>{{ flight.from }}</b><time>{{ time(flight.departs) }}</time></span>
      <span aria-hidden="true" class="arrow">→</span>
      <span><b>{{ flight.to }}</b><time>{{ time(flight.arrives) }}</time></span>
    </p>
  </div>
</template>

<style scoped>
/* a strip of ticket: the route large, what flight and when small above it */
.flight {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink);
}

p {
  margin: 0;
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
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

.route {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
  > span:not(.arrow) {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    > b {
      font-size: var(--font-lg);
      overflow-wrap: anywhere;
    }
    > time {
      font-size: var(--font-lg);
      font-weight: 700;
    }
  }
  > .arrow {
    color: var(--muted);
  }
}
</style>
