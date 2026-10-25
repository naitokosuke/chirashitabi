<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { CtHeading, CtHint, CtLink, CtPaper, safeUrl } from "../../../ui/index";

import { formatMoney } from "../../shared/money";

import { useI18n } from "../../i18n/useI18n";

import { paperOf } from "../members/paper";
import { useMembers } from "../members/useMembers";
import { siteOf } from "../notes/links";
import type { Memo, Scheduled } from "../notes/types";
import { durationMessage, hhmm } from "../trip/format";
import { endOf } from "../trip/itinerary";
import { useTrip } from "../trip/useTrip";

import Day from "./Day.vue";

/**
 * A day of the booklet as it is read: its line, each plan's time and when it ends, its price and
 * the way to its place and page, and the maybes, faded, at the end of the strip. Lateness of a
 * booking is counted from `today`.
 */
const props = defineProps<{ day: Temporal.PlainDate; today: Temporal.PlainDate }>();
const { trip, forDay, dayOf } = useTrip();
const { members } = useMembers();
const i18n = useI18n();
/** A note's paper: whoever wrote it */
const paperFor = (n: Memo) => paperOf(members.value?.find((m) => m.id === n.by)?.color);
const price = (amount: number) =>
  trip.value === undefined ? "" : formatMoney(amount, trip.value.currency, i18n.locale);

/** The strip as it is read: the maybes wait at its end */
const notes = computed(() => forDay(props.day).filter((n) => n.schedule.status !== "idea"));
const maybes = computed(() => forDay(props.day, "idea"));
/** "–14:00" under the time it starts, or null while it does not say when it ends */
function until(n: Scheduled) {
  const end = endOf(n);
  return end === null ? null : `–${hhmm(end)}`;
}
/** "1 h 30 min" */
function long(minutes: number) {
  const d = durationMessage(minutes);
  return i18n.t(d.id, d.params);
}
</script>

<template>
  <Day :day :today :notes>
    <template #intro>
      <p v-if="(dayOf(day)?.intro ?? '') !== ''" class="intro" data-turn>{{ dayOf(day)?.intro }}</p>
    </template>
    <template #tab="{ n }">
      <span class="time">{{
        n.schedule.time ? hhmm(n.schedule.time) : i18n.t("shiori.anytime")
      }}</span>
      <!-- when it ends, or with no time, how long it takes -->
      <CtHint v-if="until(n) !== null" strong>{{ until(n) }}</CtHint>
      <CtHint v-else-if="n.minutes !== null" strong>{{ long(n.minutes) }}</CtHint>
    </template>
    <template #tail="{ n }">
      <p class="meta"><span v-if="n.budget !== null && n.budget > 0">{{
          price(n.budget)
        }}</span><CtLink v-if="safeUrl(n.mapsUrl) !== undefined" :href="safeUrl(n.mapsUrl)">{{
          i18n.t("shiori.mapLink")
        }}</CtLink><CtLink v-if="safeUrl(n.link) !== undefined" :href="safeUrl(n.link)">{{
          siteOf(n.link)
        }}</CtLink></p>
    </template>
    <template #after>
      <!-- the maybes, faded, at the end of the strip -->
      <template v-if="maybes.length > 0">
        <CtHeading as="h3" class="if-time" data-turn level="minor" muted>{{
          i18n.t("shiori.ifTime")
        }}</CtHeading>
        <ol class="maybes">
          <li v-for="n in maybes" :key="n.id" data-turn>
            <CtPaper faded :paper="paperFor(n)" variant="row">
              <template #tab><span class="time">{{
                  n.schedule.time ? hhmm(n.schedule.time) : i18n.t("shiori.anytime")
                }}</span></template>
              <template #default>
                <p class="title">{{ n.title }}</p>
                <p v-if="n.budget !== null && n.budget > 0" class="meta"><span>{{
                    price(n.budget)
                  }}</span></p>
              </template>
            </CtPaper>
          </li>
        </ol>
      </template>
    </template>
  </Day>
</template>

<style scoped>
/* the day's line, written above the strip on the desk's own ruled line */
.intro {
  margin: 0 0 14px;
  padding-block-end: 8px;
  border-block-end: 1px dashed var(--line);
  font-size: var(--font-base);
  line-height: 1.7;
}

/* the time on the tab */
.time {
  padding-block-start: 2px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: var(--font-md);
}

/* the price and the way there */
.meta {
  margin: 4px 0 0;
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: var(--font-sm);
  color: var(--paper-muted);
}

.if-time {
  margin: 18px 0 6px;
}

/* the maybes, laid as the strip is */
.maybes {
  list-style: none;
  margin: 0;
  padding: 4px 0 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  .title {
    margin: 0;
    font-size: var(--font-base);
    font-weight: 700;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
}
</style>
