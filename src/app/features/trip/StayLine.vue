<script setup lang="ts" vapor>
import { computed } from "vue";

import { CtTicket, safeUrl } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { googleMapsLink } from "../place/google-maps";

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
  <CtTicket
    :aside="i18n.t('stay.when', { date: longDate(stay.checkIn, i18n.locale), count: stay.nights })"
    :label
  >
    <p class="name">{{ stay.name }}</p>
    <a v-if="href !== undefined" :href="safeUrl(href)" rel="noopener noreferrer" target="_blank">{{
      i18n.t("stay.open")
    }}</a>
  </CtTicket>
</template>

<style scoped>
/* on the ticket (CtTicket), as the flight's: the place's name in its route's size */
.name {
  margin: 0;
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
