<script setup lang="ts" vapor>
import { computed } from "vue";

import { useI18n } from "../../i18n/useI18n";

import { googleMapsLink, safeUrl } from "../place/google-maps";

import { longDate } from "./format";
import type { Stay } from "./types";

/**
 * A stay as a line beside the flights: what it is called (under `label`), from which night and
 * for how many, and the way to it in Google Maps when the trip knows where it is.
 */
const props = defineProps<{ stay: Stay; label: string }>();
const i18n = useI18n();

const href = computed(() => {
  const s = props.stay;
  return safeUrl(s.mapsUrl) ?? (s.pin === null ? undefined : googleMapsLink(s.pin));
});
</script>

<template>
  <div class="stay">
    <p class="head">
      <b>{{ label }}</b>
      <small>{{ i18n.t("stay.when", { date: longDate(stay.checkIn, i18n.locale), count: stay.nights }) }}</small>
    </p>
    <p class="name">{{ stay.name }}</p>
    <a v-if="href !== undefined" :href rel="noopener noreferrer" target="_blank">{{ i18n.t("stay.open") }}</a>
  </div>
</template>

<style scoped>
/* the flight's strip of ticket (FlightLine), the place's name in its route's size */
.stay {
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

.name {
  font-size: var(--font-lg);
  font-weight: 700;
  overflow-wrap: anywhere;
}

a {
  justify-self: start;
  font-size: var(--font-sm);
  color: var(--muted);
}
</style>
