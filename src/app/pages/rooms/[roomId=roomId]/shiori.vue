<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
} from "vue";

import {
  CtAmount,
  CtButton,
  CtCheck,
  CtChip,
  CtGlass,
  CtHeading,
  CtHint,
  CtInput,
  CtLink,
  CtMessage,
  CtPanel,
  CtPaper,
  CtPress,
  CtScrollRow,
  CtSegmented,
  CtSelect,
  CtTabList,
  CtTabPanel,
  CtTextarea,
  CtTextMorph,
  safeUrl,
  usePageTurn,
  type CtMorphPart,
} from "../../../../ui/index";

import { formatMoney } from "../../../shared/money";

import { useI18n } from "../../../i18n/useI18n";

import { paperOf } from "../../../features/members/paper";
import { useMembers } from "../../../features/members/useMembers";
import type { NoteId } from "../../../features/notes/id";
import { segments, siteOf } from "../../../features/notes/links";
import { ARRIVAL_TAG, PACKING_TAG, type Memo, type Scheduled } from "../../../features/notes/types";
import { useNotes } from "../../../features/notes/useNotes";
import { directionsLink } from "../../../features/place/google-maps";
import { clockText, fitHours, openOn, readHours, spansText } from "../../../features/place/hours";
import {
  distanceKm,
  rideMinutes,
  WALKABLE_KM,
  walkMinutes,
  wayMinutes,
} from "../../../features/place/route";
import type { LatLng } from "../../../features/place/types";
import { useOffline } from "../../../features/sync/useOffline";
import { useSync } from "../../../features/sync/useSync";
import { calendarOf } from "../../../features/trip/calendar";
import FlightLine from "../../../features/trip/FlightLine.vue";
import {
  durationChoices,
  durationMessage,
  fromHhmm,
  hhmm,
  longDate,
  shortDate,
} from "../../../features/trip/format";
import {
  assignTo,
  cycleStatus,
  draftUpdates,
  endOf,
  flightDays,
  stayOn,
  timing,
  wakeAt,
  type Timing,
} from "../../../features/trip/itinerary";
import StayLine from "../../../features/trip/StayLine.vue";
import { LEGS } from "../../../features/trip/types";
import { useTrip } from "../../../features/trip/useTrip";
import type { DayDraft } from "../../../features/worker/types";
import { usePublication } from "../../../features/worker/usePublication";
import { useWorker } from "../../../features/worker/useWorker";
import { useWorkerCalls } from "../../../features/worker/useWorkerCalls";

type Draft = DayDraft & { date: Temporal.PlainDate };

const store = useNotes();
const { trip, unassigned, forDay, byTag, budgetOf, fixedCount, dayNumber, dayOf, setIntro } =
  useTrip();
const worker = useWorker();
const sync = useSync();
const calls = useWorkerCalls();
const { members, me } = useMembers();
/** A note's paper: whoever wrote it */
const paperFor = (n: Memo) => paperOf(members.value?.find((m) => m.id === n.by)?.color);
const i18n = useI18n();
/** What the page's controls are named by, so a label can point at its box */
const pageId = useId();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
type Tab = Temporal.PlainDate | "appendix" | null;
/**
 * A picked day, the appendix, or null for "today if the trip is on, else the first day".
 * `picked` answers the tap at once (the tabs, the heading); `tab` is what the page shows,
 * and follows once the old page has cleared (see showTab).
 */
const picked = ref<Tab>(null);
const tab = ref<Tab>(null);
/** Today, read again when the page comes back: from another tab, or a phone woken the next day */
const today = shallowRef(Temporal.Now.plainDateISO());
const readToday = () => (today.value = Temporal.Now.plainDateISO());
onActivated(readToday);
onMounted(() => document.addEventListener("visibilitychange", readToday));
onBeforeUnmount(() => document.removeEventListener("visibilitychange", readToday));
const openingDay = computed(
  () =>
    trip.value?.days.find((d) => d.date.equals(today.value))?.date ??
    trip.value?.days[0]?.date ??
    null,
);
const dayOfTab = (t: Tab) => (t === "appendix" ? null : (t ?? openingDay.value));
/** The day on the page, or null on the appendix tab (or while the trip has no days) */
const day = computed(() => dayOfTab(tab.value));
/** The flights that leave or land on the day on the page, the way there first */
const flightsOn = computed(() => {
  const d = day.value;
  if (d === null) return [];
  return LEGS.flatMap((leg) => {
    const f = trip.value?.flights[leg] ?? null;
    const on = f !== null && flightDays(f, leg, trip.value?.days ?? []).some((x) => x.equals(d));
    return on ? [{ leg, flight: f, day: d }] : [];
  });
});
/** Where the night of the day on the page is spent, if the trip says */
const tonight = computed(() => {
  const d = day.value;
  return d === null ? undefined : stayOn(trip.value?.stays ?? [], d);
});
/** The day's strip as it is shown: read, the maybes wait at its end */
const shown = computed(() => {
  const d = day.value;
  if (d === null) return [];
  return editing.value ? forDay(d) : forDay(d).filter((n) => n.schedule.status !== "idea");
});
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
  const d = day.value;
  const before = new Map<NoteId, Way>();
  if (d === null) return { before, toStay: null };
  let at = wakeAt(trip.value?.stays ?? [], d)?.pin ?? null;
  let fromStay = at !== null;
  let prev: Scheduled | null = null;
  for (const n of shown.value) {
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
/** The strip as it is laid down: each sticky with the way up to it, when there is one to say */
const strip = computed(() =>
  shown.value.map((n) => ({ n, way: legs.value.before.get(n.id) ?? null })),
);
/** A leg as it reads: minutes on foot when it is a walk, else how far and a guess at a ride */
const far = (km: number) =>
  km < WALKABLE_KM
    ? i18n.t("shiori.walk", { minutes: walkMinutes(km) })
    : i18n.t("shiori.ride", { km: km.toFixed(1), minutes: rideMinutes(km) });
/** The leg up to a sticky, said from the stay when the day starts there */
function legTo(way: Way) {
  if (way.place === null) return "";
  const said = far(way.place.km);
  return way.place.fromStay ? `${i18n.t("shiori.fromStay")} · ${said}` : said;
}
/** Google Maps' directions for the leg, which know the real lines and times */
const legLink = (way: Way) =>
  way.place === null
    ? undefined
    : directionsLink(way.place.from, way.place.to, way.place.km < WALKABLE_KM);
/** Why it cannot start when it says, or "" when it can */
function legWarning(way: Way) {
  const t = way.timing;
  if (t === null) return "";
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
 * "" for none, or for a day it is closed, which the warning says
 */
function hoursOn(n: Scheduled) {
  if (n.hours === null) return "";
  const week = weekOf(n);
  if (week === null) return i18n.t("shiori.hours", { hours: n.hours });
  const spans = openOn(week, weekday(n.schedule.date));
  return spans.length === 0 ? "" : i18n.t("shiori.hours", { hours: spansText(spans) });
}
/** Why the plan falls while the place is shut, or "" when it does not, or nothing can tell */
function shutWarning(n: Scheduled): string {
  const week = weekOf(n);
  if (week === null) return "";
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
      return "";
  }
}
/** Still to book and past the day it had to be booked by */
const bookingLate = (n: Scheduled) =>
  n.booking?.state === "needed" &&
  n.booking.by !== null &&
  Temporal.PlainDate.compare(n.booking.by, today.value) < 0;
/** Whether it is booked, as it reads: "Booked · ABC123", "Book by 10/20"; "" for no booking */
function bookingLine(n: Scheduled) {
  const b = n.booking;
  if (b === null) return "";
  if (b.state === "booked")
    return b.code === "" ? i18n.t("shiori.booked") : i18n.t("shiori.bookedCode", { code: b.code });
  if (b.by === null) return i18n.t("shiori.bookingNeeded");
  return i18n.t(bookingLate(n) ? "shiori.bookingLate" : "shiori.bookingBy", { date: short(b.by) });
}
const bookingPage = (n: Scheduled) => (n.booking?.state === "booked" ? n.booking.url : null);
/** Booked, from the strip: the number and page can be written in the note later */
function markBooked(n: Scheduled) {
  store.update(n.id, { booking: { state: "booked", code: "", url: null } });
}
/** "–14:00" under the time it starts, or "" while it does not say when it ends */
function until(n: Scheduled) {
  const end = endOf(n);
  return end === null ? "" : `–${hhmm(end)}`;
}
/** "1 h 30 min" */
function long(minutes: number) {
  const d = durationMessage(minutes);
  return i18n.t(d.id, d.params);
}
/** The day the tabs and the heading show, ahead of the page by the time it takes to turn */
const pickedDay = computed(() => dayOfTab(picked.value));
const price = (amount: number) =>
  trip.value === undefined ? "" : formatMoney(amount, trip.value.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);

// tabs are keyed by the date's ISO string
const APPENDIX = "appendix";
const dayTabs = computed(() => [
  ...(trip.value?.days ?? []).map((d) => ({
    value: d.date.toString(),
    label: i18n.t("shiori.dayTab", { n: dayNumber(d.date), date: short(d.date) }),
  })),
  { value: APPENDIX, label: i18n.t("shiori.appendix") },
]);
const activeTab = computed(() => pickedDay.value?.toString() ?? APPENDIX);
/** "1日目 11/3(火)" with the date in its own tone, or "付録" */
const heading = computed((): CtMorphPart[] => {
  const date = pickedDay.value;
  if (date === null) return [{ text: i18n.t("shiori.appendix") }];
  return i18n
    .parts("shiori.dayHeading", { n: dayNumber(date), date: longDate(date, i18n.locale) })
    .map((s) => (s.kind === "text" ? { text: s.text } : { text: s.text, tone: "date" }));
});
const page = useTemplateRef<HTMLElement>("page");
const turn = usePageTurn(page);
/** The tabs and the heading move at once; the page clears, then the day's pieces are laid down */
function showTab(value: string) {
  if (value === activeTab.value) return;
  const next: Tab = value === APPENDIX ? "appendix" : Temporal.PlainDate.from(value);
  picked.value = next;
  void turn(() => (tab.value = next));
}
/** Edit and read are the same page written two ways: the switch answers at once, the page turns */
function setMode(next: Mode) {
  pickedMode.value = next;
  void turn(() => (mode.value = next));
}

type Mode = "edit" | "read";
const modes = computed((): { value: Mode; label: string }[] => [
  { value: "edit", label: i18n.t("common.edit") },
  { value: "read", label: i18n.t("shiori.read") },
]);
/** `pickedMode` is the switch, at once; `mode` is the page and the tray, once the page turns */
const pickedMode = ref<Mode>("edit");
const mode = ref<Mode>("edit");
const editing = computed(() => mode.value === "edit");
/** The memo being put on a day from the tray, by id */
const pickingId = ref<NoteId | null>(null);
/**
 * That memo as it is now, while the tray is up and it still has no day: if the partner gives
 * it one, or it goes, there is nothing left to put anywhere
 */
const picking = computed(() =>
  editing.value ? (unassigned.value.find((n) => n.id === pickingId.value) ?? null) : null,
);
const draft = ref<Draft | null>(null); // a member's draft of the open day
/** Who drafted it; nobody once they have left the room */
const drafter = computed(() => members.value?.find((m) => m.id === draft.value?.by));

const APPENDIX_TAGS = [PACKING_TAG, ARRIVAL_TAG];

const totalFixed = computed(() => budgetOf(undefined, true));
const totalAll = computed(() => budgetOf(undefined, false));
/** "11/3 – 11/5", one date for a day trip, nothing while the trip has no days */
const range = computed(() => {
  const first = trip.value?.days[0]?.date;
  const last = trip.value?.days.at(-1)?.date;
  if (first === undefined || last === undefined) return "";
  return first.equals(last) ? short(first) : `${short(first)} – ${short(last)}`;
});

function assign(n: Memo, date: Temporal.PlainDate | null) {
  store.update(n.id, assignTo(n, date));
  pickingId.value = null;
  if (date !== null) showTab(date.toString());
}
function togglePick(n: Memo) {
  pickingId.value = pickingId.value === n.id ? null : n.id;
}
/** The tray's pick row: the picked memo goes on this day */
function putPickedOn(date: Temporal.PlainDate) {
  if (picking.value !== null) assign(picking.value, date);
}
function nextStatus(n: Scheduled) {
  store.update(n.id, { schedule: cycleStatus(n.schedule) });
}
/** A tick in the appendix: shared with the room, so the partner sees the bag is packed */
/** The confirmed plan, the flights and the stays as an .ics file, saved by the browser */
function downloadCalendar() {
  const t = trip.value;
  if (t === undefined || sync.room === null) return;
  const ics = calendarOf(t, store.notes.value ?? [], sync.room, Temporal.Now.instant(), {
    flight: (number, from, to) => (number === "" ? `${from} → ${to}` : `${number} ${from} → ${to}`),
    // the labels from the messages, the names as they are: a calendar keeps no isolating marks
    stay: (name) => `${i18n.t("shiori.calendarStay")} ${name}`,
    booked: (code) => `${i18n.t("shiori.booked")} ${code}`,
  });
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  // a name a file system takes: the trip's, without the characters some refuse
  const name = t.name.replace(/[\\/:*?"<>|]+/g, " ").trim();
  a.download = `${name === "" ? "trip" : name}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function setChecked(n: Memo, checked: boolean) {
  store.update(n.id, { checked });
}
function setTime(n: Scheduled, e: Event) {
  if (!(e.target instanceof HTMLInputElement)) return;
  const time = fromHhmm(e.target.value);
  store.update(n.id, { schedule: { ...n.schedule, time } });
}
function setMinutes(n: Scheduled, e: Event) {
  if (!(e.target instanceof HTMLSelectElement)) return;
  store.update(n.id, { minutes: e.target.value === "" ? null : Number(e.target.value) });
}
function onIntroChange(e: Event) {
  if (day.value === null) return;
  if (e.target instanceof HTMLTextAreaElement) setIntro(day.value, e.target.value);
}

const {
  mutateAsync: draftDay,
  isLoading: drafting,
  error: draftError,
  data: draftAnswer,
  variables: draftAsked,
} = calls.draftDay;
/** Whether the last ask for a draft was for the day on the page: its pending and error belong there */
const askedHere = computed(() => {
  const asked = draftAsked.value?.date;
  return asked !== undefined && day.value !== null && asked.equals(day.value);
});
async function askForDraft() {
  const date = day.value;
  if (date === null || drafting.value) return;
  try {
    const answer = await draftDay({ date, notes: forDay(date) });
    if (answer.ok) draft.value = { date, ...answer.value };
  } catch {
    // the error state says so by the button; asking again is the person's tap, never a retry
  }
}
/**
 * Why the last draft did not come, or null when it came: the budget is spent (asking again
 * will not help), or it failed
 */
const draftFailure = computed(() => {
  if (draftError.value !== null) return "shiori.draftFailed";
  const answer = draftAnswer.value;
  if (answer === undefined || answer.ok) return null;
  return answer.reason.ceiling === "trip" ? "shiori.draftTripLimit" : "shiori.draftLimit";
});
// ---- the booklet as a public page: anyone sees whether it is up; the owner puts it up or down ----
const { publication, publish, withdraw } = usePublication();
const published = computed(() => publication.data.value ?? null);
const isOwner = computed(() => me.value?.role === "owner");
/** Why the last publish did not happen, or null */
const publishFailure = computed(() => {
  if (publish.error.value !== null || withdraw.error.value !== null) return "shiori.publishFailed";
  const answer = publish.data.value;
  if (answer === undefined || answer.ok) return null;
  return answer.reason.ceiling === "trip" ? "shiori.draftTripLimit" : "shiori.publishLimit";
});
const publishedOn = computed(() =>
  published.value === null
    ? ""
    : published.value.at.toLocaleString(i18n.locale, {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
);
function publishNow() {
  publish.mutate(i18n.locale);
}
/** The link copied, said for a moment on the button */
const copied = ref(false);
/** Copied again while it is said, the moment starts over: the earlier copy's end is not its end */
let copiedFor: ReturnType<typeof setTimeout> | undefined;
function uncopied() {
  copied.value = false;
}
async function copyLink() {
  if (published.value === null) return;
  try {
    await navigator.clipboard.writeText(published.value.url);
    copied.value = true;
    clearTimeout(copiedFor);
    copiedFor = setTimeout(uncopied, 1500);
  } catch {
    // the link is on the page to select by hand
  }
}

function adoptDraft() {
  if (draft.value === null) return;
  // the day's memos as they are now, not as they were when the draft was asked for
  const now = forDay(draft.value.date);
  for (const { id, patch } of draftUpdates(draft.value, now)) store.update(id, patch);
  // keep an intro someone already wrote
  const written = dayOf(draft.value.date)?.intro ?? "";
  setIntro(draft.value.date, written === "" ? draft.value.intro : written);
  draft.value = null;
}
</script>

<template>
  <article>
    <!-- no bar: the days and the edit/read switch float along the top, on glass -->
    <div class="top">
      <CtGlass class="days">
        <CtTabList
          :label="i18n.t('shiori.days')"
          :tabs="dayTabs"
          variant="pill"
          :model-value="activeTab"
          @update:model-value="showTab"
        />
      </CtGlass>
      <CtGlass class="mode">
        <CtSegmented
          :model-value="pickedMode"
          :label="i18n.t('shiori.mode')"
          :options="modes"
          @update:model-value="setMode"
        />
      </CtGlass>
    </div>

    <!-- what holds for the whole trip stays put above the page; only the day's page morphs -->
    <div class="lead">
      <CtHint size="sm"><template v-if="range !== ''">{{ range }} · </template>{{
          totalAll > 0
            ? i18n.t("shiori.summary", { fixed: fixedCount, total: price(totalFixed) })
            : i18n.t("shiori.summaryCount", { fixed: fixedCount })
        }}<small v-if="totalAll > totalFixed">{{
          i18n.t("shiori.withMaybes", { total: price(totalAll) })
        }}</small></CtHint>

      <!-- tray: memos without a day (edit mode only) -->
      <CtPanel v-if="editing" as="section">
        <div><span>{{ i18n.t("shiori.trayTitle", { count: unassigned.length }) }}</span><small>{{
            i18n.t("shiori.trayHint")
          }}</small></div>
        <CtHint v-if="unassigned.length === 0" size="sm">{{ i18n.t("shiori.trayEmpty") }}</CtHint>
        <CtScrollRow v-else as="ul">
          <!-- each a slip of its writer's paper; the tap anywhere on it is its button's -->
          <li v-for="n in unassigned" :key="n.id">
            <CtPaper :paper="paperFor(n)" :selected="picking?.id === n.id">
              <template #default>
                <CtPress cover :aria-pressed="picking?.id === n.id" @click="() => togglePick(n)">{{
                  n.title
                }}</CtPress>
              </template>
              <template #foot>
                <span v-for="t in n.tags" :key="t">#{{ t }}</span>
              </template>
            </CtPaper>
          </li>
        </CtScrollRow>
        <div v-if="picking !== null">
          <span>{{ i18n.t("shiori.putOn", { title: picking.title }) }}</span>
          <CtButton
            v-for="d in trip?.days"
            :key="d.date.toString()"
            variant="primary"
            @click="() => putPickedOn(d.date)"
          >{{ short(d.date) }}</CtButton>
          <CtButton @click="() => (pickingId = null)">{{ i18n.t("shiori.later") }}</CtButton>
        </div>
      </CtPanel>

      <!-- the open day's heading stays put while its page slides; only the characters that change move -->
      <CtHeading :aria-label="heading.map((p) => p.text).join('')"><CtTextMorph :parts="heading" /></CtHeading>
    </div>

    <div ref="page" class="page">
      <!-- the page (this scrolling body) morphs when the day or the mode changes: see showTab -->
      <CtTabPanel>
        <!-- ---------- a day ---------- -->
        <template v-if="day !== null">
          <!-- a flight that day, and where its night is spent, head the page, before anything planned around them -->
          <div v-if="flightsOn.length > 0 || tonight !== undefined" class="flights" data-turn>
            <FlightLine
              v-for="f in flightsOn"
              :key="f.leg"
              :flight="f.flight"
              :leg="f.leg"
              :on="f.day"
            />
            <StayLine
              v-if="tonight !== undefined"
              :label="i18n.t('stay.tonight')"
              :stay="tonight"
            />
          </div>
          <template v-if="editing">
            <!-- written when it is left (change), not as each letter goes in -->
            <CtTextarea
              dashed
              data-turn
              rows="2"
              :aria-label="i18n.t('shiori.intro')"
              :placeholder="i18n.t('shiori.introPlaceholder')"
              :model-value="dayOf(day)?.intro ?? ''"
              @change="onIntroChange"
            />
          </template>
          <p v-else-if="(dayOf(day)?.intro ?? '') !== ''" class="intro" data-turn>{{
            dayOf(day)?.intro
          }}</p>

          <CtHint v-if="forDay(day).length === 0" class="empty" data-turn size="sm">{{
            i18n.t("shiori.dayEmpty")
          }}</CtHint>

          <!-- the day is a strip of the same stickies as the canvas, pinned in time order -->
          <ol>
            <template v-for="{ n, way } in strip" :key="n.id">
              <!-- how far it is from the place before it (a guess as the crow flies, to plan by),
                   Google's directions for it, and whether it can start when it says -->
              <li v-if="way !== null" class="leg" data-turn>
                <span v-if="legTo(way) !== ''">{{ legTo(way) }}</span>
                <CtLink v-if="safeUrl(legLink(way)) !== undefined" :href="legLink(way)">{{
                  i18n.t("shiori.route")
                }}</CtLink>
                <strong v-if="legWarning(way) !== ''">{{ legWarning(way) }}</strong>
              </li>
              <li :class="`status-${n.schedule.status}`" data-turn>
                <CtPaper
                  :paper="paperFor(n)"
                  :stamp="n.schedule.status === 'done' ? i18n.t('status.done') : undefined"
                  variant="row"
                >
                  <template #tab>
                    <template v-if="editing">
                      <CtInput
                        size="sm"
                        type="time"
                        :aria-label="i18n.t('shiori.timeOf', { title: n.title })"
                        :model-value="n.schedule.time ? hhmm(n.schedule.time) : ''"
                        @change="(e) => setTime(n, e)"
                      />
                      <CtSelect
                        size="sm"
                        :aria-label="i18n.t('shiori.minutesOf', { title: n.title })"
                        :model-value="String(n.minutes ?? '')"
                        @change="(e) => setMinutes(n, e)"
                      >
                        <option value="">{{ i18n.t("duration.unset") }}</option>
                        <option v-for="m in durationChoices(n.minutes)" :key="m" :value="String(m)">{{
                          long(m)
                        }}</option>
                      </CtSelect>
                    </template>
                    <template v-else>
                      <span class="time">{{
                        n.schedule.time ? hhmm(n.schedule.time) : i18n.t("shiori.anytime")
                      }}</span>
                      <!-- when it ends, or with no time, how long it takes -->
                      <CtHint v-if="until(n) !== ''" strong>{{ until(n) }}</CtHint>
                      <CtHint v-else-if="n.minutes !== null" strong>{{
                        long(n.minutes)
                      }}</CtHint>
                    </template>
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
                    <CtHint v-if="hoursOn(n) !== ''" class="hours" strong>{{ hoursOn(n) }}</CtHint>
                    <p v-if="shutWarning(n) !== ''" class="warn">{{ shutWarning(n) }}</p>
                    <!-- whether it is booked: its number and page, or by when it has to be -->
                    <p
                      v-if="bookingLine(n) !== ''"
                      class="booking"
                      :class="{ late: bookingLate(n) }"
                    >
                      <span>{{ bookingLine(n) }}</span>
                      <CtLink v-if="safeUrl(bookingPage(n)) !== undefined" :href="bookingPage(n)">{{
                        i18n.t("shiori.bookingPage")
                      }}</CtLink>
                      <CtButton
                        v-if="editing && n.booking?.state === 'needed'"
                        variant="text"
                        @click="() => markBooked(n)"
                      >{{ i18n.t("shiori.markBooked") }}</CtButton>
                    </p>
                    <div v-if="editing" class="edit">
                      <!-- three steps in one ink: a dashed maybe, a filled confirmed, a plain done -->
                      <CtChip
                        :dashed="n.schedule.status === 'idea'"
                        :selected="n.schedule.status === 'fixed'"
                        @click="() => nextStatus(n)"
                      >{{ i18n.t(`status.${n.schedule.status}`) }}</CtChip>
                      <span v-if="n.budget !== null && n.budget > 0">{{ price(n.budget) }}</span>
                      <CtButton
                        class="off"
                        danger
                        size="sm"
                        variant="text"
                        @click="() => assign(n, null)"
                      >{{
                        i18n.t("shiori.removeDay")
                      }}</CtButton>
                    </div>
                    <p v-else class="meta"><span v-if="n.budget !== null && n.budget > 0">{{
                        price(n.budget)
                      }}</span><CtLink v-if="safeUrl(n.mapsUrl) !== undefined" :href="n.mapsUrl">{{
                        i18n.t("shiori.mapLink")
                      }}</CtLink><CtLink v-if="safeUrl(n.link) !== undefined" :href="n.link">{{
                        siteOf(n.link)
                      }}</CtLink></p>
                  </template>
                </CtPaper>
              </li>
            </template>
            <li v-if="legs.toStay !== null" class="leg" data-turn>{{
              `${i18n.t("shiori.toStay")} · ${far(legs.toStay)}`
            }}</li>
          </ol>

          <!-- read mode: the maybes, faded, at the end of the strip -->
          <template v-if="!editing && forDay(day, 'idea').length > 0">
            <CtHeading as="h3" data-turn level="minor" muted>{{
              i18n.t("shiori.ifTime")
            }}</CtHeading>
            <ol class="maybes">
              <li v-for="n in forDay(day, 'idea')" :key="n.id" data-turn>
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

          <!-- a member's draft of the day (edit mode) -->
          <template v-if="editing && worker.api !== null && forDay(day).length > 0">
            <CtPaper
              v-if="draft !== null && draft.date.equals(day)"
              class="draft"
              data-turn
              variant="proposal"
              wide
            >
              <template #strip>{{ i18n.t("shiori.draft") }} · {{ drafter?.name ?? i18n.t("member.someone") }}</template>
              <template #default>
                <p>{{ draft.reason }}</p>
                <ol><li v-for="it in draft.items" :key="it.note.id">{{ it.time ? `${hhmm(it.time)} ` : "" }}{{ it.note.title }}<small
                      v-if="it.minutes !== null"
                    >{{ ` · ${long(it.minutes)}` }}</small></li></ol>
              </template>
              <template #foot>
                <CtButton variant="primary" @click="adoptDraft">{{
                  i18n.t("shiori.adoptDraft")
                }}</CtButton>
                <CtButton @click="() => (draft = null)">{{ i18n.t("common.dismiss") }}</CtButton>
              </template>
            </CtPaper>
            <template v-else>
              <CtButton
                data-turn
                variant="ask"
                :disabled="drafting || cut.offline"
                :busy="drafting && askedHere"
                @click="askForDraft"
              >{{
                i18n.t(drafting && askedHere ? "shiori.drafting" : "shiori.askDraft")
              }}</CtButton>
              <CtHint v-if="cut.offline" data-turn>{{ i18n.t("offline.unavailable") }}</CtHint>
              <CtMessage
                v-if="draftFailure !== null && askedHere && !drafting"
                aria-live="polite"
                danger
              >{{ i18n.t(draftFailure) }}</CtMessage>
            </template>
          </template>

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

        <!-- ---------- appendix ---------- -->
        <template v-else>
          <section v-for="t in APPENDIX_TAGS" :key="t">
            <CtHeading data-turn>#{{ t }}</CtHeading>
            <ul><li v-for="n in byTag(t)" :key="n.id" data-turn><CtPaper
                  :paper="paperFor(n)"
                  variant="row"
                ><CtCheck
                    :id="`${pageId}-check-${n.id}`"
                    :model-value="n.checked"
                    @update:model-value="(checked) => setChecked(n, checked)"
                  ><span class="item">{{ n.title }}</span><small v-if="n.body !== ''" class="note"> —{{ n.body }}</small></CtCheck></CtPaper></li></ul>
            <CtHint v-if="byTag(t).length === 0" data-turn size="sm">{{
              i18n.t("shiori.tagEmpty")
            }}</CtHint>
          </section>
          <!-- the plan out to a calendar: confirmed notes, flights and stays -->
          <section class="out">
            <CtHeading data-turn>{{ i18n.t("shiori.out") }}</CtHeading>
            <CtButton data-turn @click="downloadCalendar">{{ i18n.t("shiori.calendar") }}</CtButton>
            <CtHint data-turn size="sm">{{ i18n.t("shiori.calendarHint") }}</CtHint>
            <!-- the booklet as a page anyone with its link can read -->
            <template v-if="worker.api !== null">
              <CtHeading as="h3" data-turn level="minor">{{
                i18n.t("shiori.publicTitle")
              }}</CtHeading>
              <CtHint data-turn size="sm">{{ i18n.t("shiori.publicHint") }}</CtHint>
              <CtPanel v-if="published !== null" class="link" data-turn>
                <CtLink :href="published.url">{{ published.url }}</CtLink>
                <small>{{ i18n.t("shiori.publishedAt", { at: publishedOn }) }}</small>
                <CtButton @click="copyLink">{{
                  i18n.t(copied ? "shiori.copied" : "shiori.copyLink")
                }}</CtButton>
              </CtPanel>
              <CtHint v-else data-turn size="sm">{{
                i18n.t(isOwner ? "shiori.notPublished" : "shiori.ownerPublishes")
              }}</CtHint>
              <div v-if="isOwner" class="actions" data-turn>
                <CtButton
                  :disabled="publish.isLoading.value || cut.offline"
                  :busy="publish.isLoading.value"
                  @click="publishNow"
                >{{
                  i18n.t(
                    publish.isLoading.value
                      ? "shiori.publishing"
                      : published === null
                        ? "shiori.publish"
                        : "shiori.republish",
                  )
                }}</CtButton>
                <CtButton
                  v-if="published !== null"
                  :disabled="withdraw.isLoading.value || cut.offline"
                  @click="() => withdraw.mutate()"
                >{{ i18n.t("shiori.withdraw") }}</CtButton>
              </div>
              <CtMessage v-if="publishFailure !== null" aria-live="polite" danger>{{
                i18n.t(publishFailure)
              }}</CtMessage>
              <CtHint v-else-if="isOwner && cut.offline">{{
                i18n.t("offline.unavailable")
              }}</CtHint>
            </template>
          </section>
        </template>
      </CtTabPanel>
    </div>

  </article>
</template>

<style scoped>
@import "../../../../ui/styles/media.css";

article {
  position: absolute;
  inset: 0;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  /* under the row that floats at the top, and above the dock */
  padding-block: var(--top-clear) var(--dock-clear);

  /* the days and the switch, floating in the row where a bar would be */
  > .top {
    position: absolute;
    inset-inline: 0;
    inset-block-start: 0;
    z-index: var(--z-chrome);
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--top-row);
    /* in the page's column, so the days start where the page does */
    padding: var(--top-inset) var(--page-margin) 0;
    pointer-events: none;

    > * {
      pointer-events: auto;
    }

    /* the days: as wide as they need, scrolling past the column's width */
    > .days {
      flex: 0 1 auto;
    }

    /* the edit/read switch, at the end */
    > .mode {
      flex-shrink: 0;
      margin-inline-start: auto;
    }
  }

  /* above the page and never scrolled: the trip's sums and, in edit mode, the tray */
  > .lead {
    position: relative;
    flex-shrink: 0;
    padding: 0 var(--page-margin) 4px;

    /* the page's edge: a hairline across the column, not the screen */
    &::after {
      content: "";
      position: absolute;
      inset-inline: var(--page-margin);
      inset-block-end: 0;
      height: 1px;
      background: var(--line);
    }

    > p {
      margin: 10px 0 0;

      > small {
        font-size: var(--font-xs);
      }
    }

    /* the notes still without a day, on a tool panel above the page */
    > section {
      margin-block: 10px 6px;

      > div:first-child {
        display: flex;
        justify-content: space-between;
        font-size: var(--font-sm);
        font-weight: 700;
        margin-block-end: 6px;

        > small {
          color: var(--muted);
          font-size: var(--font-sm);
        }
      }

      > p {
        padding: 14px 0;
      }

      /* each slip as tall as the tallest */
      > ul > li {
        flex-shrink: 0;
        align-self: stretch;
        display: flex;
        /* the slip's title (a CtPress over the whole slip) in this type */
        font-size: var(--font-sm);
        font-weight: 700;
        line-height: 1.35;

        span {
          font-size: var(--font-xs);
          font-weight: 700;
          color: var(--paper-muted);
        }
      }

      > div:last-child {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        padding-block-start: 6px;

        > span {
          font-size: var(--font-sm);
          font-weight: 700;
          margin-inline-end: 4px;
        }
      }
    }

    /* the open day's heading, at the foot of the lead, over the page */
    > h2 {
      margin: 14px 0 10px;

      /* the date after "1日目", quieter; its characters are the morph's own */
      :deep(.date) {
        font-size: var(--font-md);
        color: var(--muted);
      }
    }
  }

  /* a booklet is read at a page's width, on a laptop too */
  > .page {
    flex: 1;
    overflow-y: auto;
    /* clear of the lead's edge before the day starts */
    padding: 16px var(--page-margin) 24px;

    > div {
      > textarea {
        margin-block-end: 10px;
      }

      > .flights {
        display: grid;
        gap: 8px;
        margin-block-end: 14px;
      }

      /* the day's line, written above the strip on the desk's own ruled line */
      > .intro {
        margin: 0 0 14px;
        padding-block-end: 8px;
        border-block-end: 1px dashed var(--line);
        font-size: var(--font-base);
        line-height: 1.7;
      }

      > .empty {
        margin-block: 1em;
        padding: 14px 0;
      }

      /* ---- the strip: stickies pinned in order ---- */
      > ol {
        list-style: none;
        margin: 0;
        /* on the column's edges, like the intro above and the ask below */
        padding: 4px 0 10px;
        display: flex;
        flex-direction: column;
        gap: 12px;

        /* the way from one place to the next: no paper, a dotted line down from the time tabs, and how far */
        > li.leg {
          margin-block: -4px;
          margin-inline-start: 34px;
          padding: 2px 0 2px 14px;
          border-inline-start: 2px dotted color-mix(in oklch, var(--ink) 30%, transparent);
          color: var(--muted);
          font-size: var(--font-xs);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          column-gap: 10px;

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

          /* the time on the tab */
          .time {
            padding-block-start: 2px;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            font-size: var(--font-md);
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
            margin: 4px 0 0;
          }

          /* the plan falls while the place is shut: the one color that means trouble, darkened for the paper */
          .warn {
            margin: 4px 0 0;
            font-size: var(--font-xs);
            font-weight: 700;
            color: oklch(from var(--danger) min(l, 0.5) c h);
          }

          /* whether it is booked: quiet once it is, the trouble color once it is late */
          .booking {
            margin: 4px 0 0;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            column-gap: 10px;
            font-size: var(--font-xs);
            font-weight: 700;

            &.late {
              color: oklch(from var(--danger) min(l, 0.5) c h);
            }
          }

          /* the body */
          .words {
            margin: 2px 0 0;
            font-size: var(--font-sm);
            color: var(--paper-muted);
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          /* edit mode: the status, the price, taking it off the day */
          .edit {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-block-start: 6px;

            > span {
              color: var(--paper-muted);
              font-size: var(--font-sm);
            }

            /* taking it off the day: quiet, at the row's end */
            > .off {
              margin-inline-start: auto;
            }
          }

          /* read mode: the price and the way there */
          .meta {
            margin: 4px 0 0;
            display: flex;
            gap: 12px;
            align-items: center;
            font-size: var(--font-sm);
            color: var(--paper-muted);
          }
        }
      }

      > h3 {
        margin: 18px 0 6px;
      }

      /* a member's draft of the day (a class: the flights above are a div on the page too) */
      /* the agent's slip (CtPaper proposal), as on the canvas: why, then the day it would make */
      > .draft {
        margin-block-start: 14px;

        p {
          margin: 0 0 6px;
          font-size: var(--font-md);
          line-height: 1.5;
        }

        ol {
          margin: 0;
          padding-inline-start: 20px;
          font-size: var(--font-md);
        }
      }

      /* ask for a draft */
      > button {
        margin-block-start: 14px;
      }

      /* a Worker call that did not go through; trying again is the button's own tap */
      > p[aria-live] {
        margin: 8px 0 0;
      }

      > .total {
        margin: 16px 0 0;
        text-align: end;
      }

      /* the appendix: a checklist written on the notes' own paper */
      > section {
        & + section {
          margin-block-start: 18px;
        }

        > h2 {
          margin: 20px 0 10px;
        }

        > ul {
          list-style: none;
          margin: 0;
          padding: 4px 0 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;

          /* each item a slip of its writer's paper (CtPaper row), the whole slip its box to tick (CtCheck) */
          > li {
            font-size: var(--font-base);

            .note {
              color: var(--paper-muted);
              font-size: var(--font-sm);
            }

            /* ticked: struck through in the paper's quieter ink, still readable */
            &:has(input:checked) .item {
              color: var(--paper-muted);
              text-decoration: line-through;
              text-decoration-thickness: 1.5px;
            }
          }
        }

        /* a section's own lines (CtHint, CtMessage) keep the paragraph's room above and below */
        > p {
          margin-block: 1em;
        }

        /* the public page: its link, as of when, and the owner's buttons */
        &.out {
          > h3 {
            margin: 22px 0 6px;
          }

          > .link {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px 12px;
            font-size: var(--font-sm);

            > a {
              flex-basis: 100%;
            }

            > small {
              color: var(--muted);
              font-size: var(--font-xs);
            }
          }

          > .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-block-start: 10px;
          }
        }

      }
    }
  }
}
</style>
