<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { CtAmount, CtHint, CtLink, CtPaper, safeUrl } from "../../../ui/index";

import { formatMoney } from "../../shared/money";

import { useI18n } from "../../i18n/useI18n";

import { paperOf } from "../members/paper";
import { useMembers } from "../members/useMembers";
import type { NoteId } from "../notes/id";
import { segments } from "../notes/links";
import type { Memo, Scheduled } from "../notes/types";
import { directionsLink } from "../place/google-maps";
import { clockText, fitHours, openOn, readHours, spansText } from "../place/hours";
import { distanceKm, rideMinutes, WALKABLE_KM, walkMinutes, wayMinutes } from "../place/route";
import type { LatLng } from "../place/types";
import { useInRoom } from "../sync/InRoom.vue";
import FlightLine from "../trip/FlightLine.vue";
import { shortDate } from "../trip/format";
import { flightDays, stayOn, timing, wakeAt, type Timing } from "../trip/itinerary";
import StayLine from "../trip/StayLine.vue";
import { LEGS } from "../trip/types";
import { useTrip } from "../trip/useTrip";

/**
 * A day of the booklet, as both its ways of being written share it: the flights and the night's
 * stay at its head, its line (`intro`), its strip of stickies (`notes`, in time order) with the
 * way up to each, what follows the strip (`after`), and what the day costs. Each sticky's time
 * tab (`tab`), what is done beside its booking (`booking`) and its last line (`tail`) are the
 * writer's. Lateness of a booking is counted from `today`.
 */
const props = defineProps<{
  day: Temporal.PlainDate;
  today: Temporal.PlainDate;
  notes: Scheduled[];
}>();
defineSlots<{
  intro(): unknown;
  tab(props: { n: Scheduled }): unknown;
  booking(props: { n: Scheduled }): unknown;
  tail(props: { n: Scheduled }): unknown;
  after(): unknown;
}>();
const { forDay, budgetOf } = useTrip();
/** The trip the day is of: its money, flights and stays */
const here = useInRoom();
const { members } = useMembers();
const i18n = useI18n();
/** A note's paper: whoever wrote it */
const paperFor = (n: Memo) => paperOf(members.value?.find((m) => m.id === n.by)?.color);
const price = (amount: number) => formatMoney(amount, here.trip.currency, i18n.locale);

/** The flights that leave or land on the day, the way there first */
const flightsOn = computed(() =>
  LEGS.flatMap((leg) => {
    const f = here.trip.flights[leg];
    const on = f !== null && flightDays(f, leg, here.trip.days).some((x) => x.equals(props.day));
    return on ? [{ leg, flight: f }] : [];
  }),
);
/** Where the night of the day is spent, if the trip says */
const tonight = computed(() => stayOn(here.trip.stays, props.day));

/** The way up to a sticky: from where, how far, and whether it can start when it says */
interface Way {
  /** From the last place before it, when both have one */
  place: { from: LatLng; to: LatLng; km: number; fromStay: boolean } | null;
  /** It starts before the one before ends, or too soon to get there; null when it works */
  timing: Timing | null;
}
/**
 * The way to each sticky: how far it is from the last place before it on the strip (the first
 * from the stay the day wakes at), and whether it can start when it says after the one just
 * before ends and the way between them; and from the last place to where the night is spent
 */
const legs = computed(() => {
  const before = new Map<NoteId, Way>();
  let at = wakeAt(here.trip.stays, props.day)?.pin ?? null;
  let fromStay = at !== null;
  let prev: Scheduled | null = null;
  for (const n of props.notes) {
    const place =
      n.pin === null || at === null
        ? null
        : { from: at, to: n.pin, km: distanceKm(at, n.pin), fromStay };
    // the way counts only from the one just before; from further back, or unknown, it is none
    const way = place !== null && !fromStay && prev?.pin === at ? wayMinutes(place.km) : 0;
    const t = prev === null ? null : timing(prev, n, way);
    if (place !== null || t !== null) before.set(n.id, { place, timing: t });
    if (n.pin !== null) {
      at = n.pin;
      fromStay = false;
    }
    prev = n;
  }
  const night = tonight.value?.pin ?? null;
  const toStay = night === null || at === null || fromStay ? null : distanceKm(at, night);
  return { before, toStay };
});
/** A leg as it reads: minutes on foot when it is a walk, else how far and a guess at a ride */
const far = (km: number) =>
  km < WALKABLE_KM
    ? i18n.t("shiori.walk", { minutes: walkMinutes(km) })
    : i18n.t("shiori.ride", { km: km.toFixed(1), minutes: rideMinutes(km) });
/** The leg up to a sticky, said from the stay when the day starts there; null with no place */
function legTo(way: Way) {
  if (way.place === null) return null;
  const said = far(way.place.km);
  return way.place.fromStay ? `${i18n.t("shiori.fromStay")} · ${said}` : said;
}
/** Google Maps' directions for the leg, which know the real lines and times; null with no place */
const legLink = (way: Way) =>
  way.place === null
    ? null
    : (safeUrl(directionsLink(way.place.from, way.place.to, way.place.km < WALKABLE_KM)) ?? null);
/** Why it cannot start when it says, or null when it can */
function legWarning(way: Way) {
  const t = way.timing;
  if (t === null) return null;
  return t.kind === "overlap"
    ? i18n.t("shiori.overlap", { minutes: t.minutes })
    : i18n.t("shiori.tight", { gap: t.gap, way: t.way });
}
/** The memo's place's week, read, or null when it says none or cannot be read */
const weekOf = (n: Scheduled) => (n.hours === null ? null : readHours(n.hours));
/** Weekday `date` is, Monday 0, as the hours count them */
const weekday = (date: Temporal.PlainDate) => date.dayOfWeek - 1;
/**
 * When the place is open on the memo's day, or its hours as written when they cannot be read;
 * null for none, or for a day it is closed, which the warning says
 */
function hoursOn(n: Scheduled) {
  if (n.hours === null) return null;
  const week = weekOf(n);
  if (week === null) return i18n.t("shiori.hours", { hours: n.hours });
  const spans = openOn(week, weekday(n.schedule.date));
  return spans.length === 0 ? null : i18n.t("shiori.hours", { hours: spansText(spans) });
}
/** Why the plan falls while the place is shut, or null when it does not, or nothing can tell */
function shutWarning(n: Scheduled) {
  const week = weekOf(n);
  if (week === null) return null;
  const day = weekday(n.schedule.date);
  const time = n.schedule.time;
  // closed all day is worth saying with a time or without
  const fit = fitHours(week, day, time === null ? null : time.hour * 60 + time.minute, n.minutes);
  // every kind named: a new one fails to compile here
  switch (fit.kind) {
    case "closed":
      return i18n.t("shiori.closedDay");
    case "shut":
      return i18n.t("shiori.shut", { hours: spansText(openOn(week, day)) });
    case "closes":
      return i18n.t("shiori.closes", { time: clockText(fit.at) });
    case "open":
      return null;
  }
}
/**
 * Whether it is booked, as it reads ("Booked · ABC123", "Book by 10/20"), whether it is past the
 * day it had to be booked by, and the booking's page; null for no booking
 */
function bookingOf(n: Scheduled) {
  const b = n.booking;
  if (b === null) return null;
  if (b.state === "booked")
    return {
      line: b.code === "" ? i18n.t("shiori.booked") : i18n.t("shiori.bookedCode", { code: b.code }),
      late: false,
      page: safeUrl(b.url) ?? null,
    };
  if (b.by === null) return { line: i18n.t("shiori.bookingNeeded"), late: false, page: null };
  const late = Temporal.PlainDate.compare(b.by, props.today) < 0;
  const date = shortDate(b.by, i18n.locale);
  return {
    line: i18n.t(late ? "shiori.bookingLate" : "shiori.bookingBy", { date }),
    late,
    page: null,
  };
}
/** The strip as it is laid down: each sticky with the way up to it, when there is one to say */
const strip = computed(() =>
  props.notes.map((n) => {
    const way = legs.value.before.get(n.id);
    return {
      n,
      leg:
        way === undefined ? null : { to: legTo(way), link: legLink(way), warning: legWarning(way) },
      hours: hoursOn(n),
      shut: shutWarning(n),
      booking: bookingOf(n),
    };
  }),
);
</script>

<template>
  <!-- a flight that day, and where its night is spent, head the page, before anything planned around them -->
  <div v-if="flightsOn.length > 0 || tonight !== undefined" class="flights" data-turn>
    <FlightLine v-for="f in flightsOn" :key="f.leg" :flight="f.flight" :leg="f.leg" :on="day" />
    <StayLine v-if="tonight !== undefined" :label="i18n.t('stay.tonight')" :stay="tonight" />
  </div>
  <slot name="intro" />

  <CtHint v-if="forDay(day).length === 0" class="empty" data-turn size="sm">{{
    i18n.t("shiori.dayEmpty")
  }}</CtHint>

  <!-- the day is a strip of the same stickies as the canvas, pinned in time order -->
  <ol class="strip">
    <template v-for="{ n, leg, hours, shut, booking } in strip" :key="n.id">
      <!-- how far it is from the place before it (a guess as the crow flies, to plan by),
           Google's directions for it, and whether it can start when it says -->
      <li v-if="leg !== null" class="leg" data-turn>
        <span v-if="leg.to !== null">{{ leg.to }}</span>
        <CtLink v-if="leg.link !== null" :href="leg.link">{{ i18n.t("shiori.route") }}</CtLink>
        <strong v-if="leg.warning !== null">{{ leg.warning }}</strong>
      </li>
      <li :class="`status-${n.schedule.status}`" data-turn>
        <CtPaper
          :paper="paperFor(n)"
          :stamp="n.schedule.status === 'done' ? i18n.t('status.done') : undefined"
          variant="row"
        >
          <template #tab>
            <slot name="tab" :n />
          </template>
          <template #default>
            <p class="title">{{ n.title }}</p>
            <p v-if="n.body !== ''" class="words"><template
                v-for="s in segments(n.body)"
                :key="s.at"
              ><CtLink v-if="s.kind === 'link'" :href="s.url" inline>{{ s.url }}</CtLink><template
                  v-else
                >{{ s.text }}</template></template></p>
            <!-- when its place is open that day, and whether the plan falls while it is shut -->
            <CtHint v-if="hours !== null" class="hours" strong>{{ hours }}</CtHint>
            <p v-if="shut !== null" class="warn">{{ shut }}</p>
            <!-- whether it is booked: its number and page, or by when it has to be -->
            <p v-if="booking !== null" class="booking" :class="{ late: booking.late }">
              <span>{{ booking.line }}</span>
              <CtLink v-if="booking.page !== null" :href="booking.page">{{
                i18n.t("shiori.bookingPage")
              }}</CtLink>
              <slot name="booking" :n />
            </p>
            <slot name="tail" :n />
          </template>
        </CtPaper>
      </li>
    </template>
    <li v-if="legs.toStay !== null" class="leg" data-turn>{{
      `${i18n.t("shiori.toStay")} · ${far(legs.toStay)}`
    }}</li>
  </ol>

  <slot name="after" />

  <CtAmount
    v-if="budgetOf(day) > 0"
    :aside="budgetOf(day, false) > budgetOf(day)
      ? i18n.t('shiori.withMaybes', { total: price(budgetOf(day, false)) })
      : undefined"
    class="total"
    data-turn
    :value="i18n.t('shiori.dayTotal', { total: price(budgetOf(day)) })"
  />
</template>

<style scoped>
.flights {
  display: grid;
  gap: var(--space-4);
  margin-block-end: var(--space-7);
}

.empty {
  margin-block: 1em;
  padding: var(--space-7) 0;
}

/* ---- the strip: stickies pinned in order ---- */
.strip {
  list-style: none;
  margin: 0;
  /* on the column's edges, like the intro above and the ask below */
  padding: var(--space-2) 0 var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);

  /* the way from one place to the next: no paper, a dotted line down from the time tabs, and how far */
  > li.leg {
    margin-block: calc(-1 * var(--space-2));
    margin-inline-start: 34px;
    padding: var(--space-1) 0 var(--space-1) var(--space-7);
    border-inline-start: 2px dotted color-mix(in oklch, var(--ink) 30%, transparent);
    color: var(--muted);
    font-size: var(--font-xs);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--space-5);

    /* it cannot start when it says: said in the one color that means trouble */
    > strong {
      flex-basis: 100%;
      color: var(--danger);
    }
  }

  /*
   * A sticky, the same paper as on the canvas (CtPaper row), its time on the tab down its
   * left edge; level, for reading (only the desk tilts)
   */
  > li {
    /* done: stamped (CtPaper stamp), and the title steps back to its quieter ink */
    &.status-done .title {
      color: var(--paper-muted);
    }

    .title {
      margin: 0;
      font-size: var(--font-base);
      font-weight: 700;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    /* when its place is open that day */
    .hours {
      margin: var(--space-2) 0 0;
    }

    /* the plan falls while the place is shut: the one color that means trouble, darkened for the paper */
    .warn {
      margin: var(--space-2) 0 0;
      font-size: var(--font-xs);
      font-weight: 700;
      color: oklch(from var(--danger) min(l, 0.5) c h);
    }

    /* whether it is booked: quiet once it is, the trouble color once it is late */
    .booking {
      margin: var(--space-2) 0 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      column-gap: var(--space-5);
      font-size: var(--font-xs);
      font-weight: 700;

      &.late {
        color: oklch(from var(--danger) min(l, 0.5) c h);
      }
    }

    /* the body */
    .words {
      margin: var(--space-1) 0 0;
      font-size: var(--font-sm);
      color: var(--paper-muted);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
}

.total {
  margin: var(--space-8) 0 0;
  text-align: end;
}
</style>
