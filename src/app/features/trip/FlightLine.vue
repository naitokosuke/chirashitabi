<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { CtTicket } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { longDate } from "./format";
import type { Flight, Leg } from "./types";

/**
 * One flight as a line on a ticket: which way, its number, and from where at what time to where
 * at what time, each in its own airport's local time; a time not known yet is left out. The day
 * is said once, or twice when it lands on another day than it leaves; with no times, `on` is it.
 */
const props = defineProps<{ leg: Leg; flight: Flight; on?: Temporal.PlainDate }>();
const i18n = useI18n();

const time = (t: Flight["departs"]) =>
  t === null ? "" : t.toPlainTime().toString({ smallestUnit: "minute" });
const days = computed(() => {
  const leaves = props.flight.departs?.toPlainDate() ?? props.flight.arrives?.toPlainDate();
  const lands = props.flight.arrives?.toPlainDate() ?? leaves;
  if (leaves === undefined || lands === undefined)
    return props.on === undefined ? "" : longDate(props.on, i18n.locale);
  const from = longDate(leaves, i18n.locale);
  return leaves.equals(lands) ? from : `${from} – ${longDate(lands, i18n.locale)}`;
});
</script>

<template>
  <CtTicket
    :aside="days"
    :detail="flight.number"
    :label="i18n.t(leg === 'out' ? 'flight.out' : 'flight.back')"
  >
    <p class="route">
      <span><b>{{ flight.from }}</b><time v-if="flight.departs !== null">{{
          time(flight.departs)
        }}</time></span>
      <span aria-hidden="true" class="arrow">→</span>
      <span><b>{{ flight.to }}</b><time v-if="flight.arrives !== null">{{
          time(flight.arrives)
        }}</time></span>
    </p>
  </CtTicket>
</template>

<style scoped>
/* on the ticket (CtTicket), in its large line: from, then to, each with its time */
.route {
  margin: 0;
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
  }
  > .arrow {
    color: var(--muted);
  }
}
</style>
