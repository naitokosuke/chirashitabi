<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, reactive, useId } from "vue";

import { CtButton, CtField, CtInput } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import Icon from "../../icons/Icon.vue";
import minusIcon from "../../icons/minus.svg";
import plusIcon from "../../icons/plus.svg";
import { useNotes } from "../notes/useNotes";
import { isShortMapsLink, placeSearchLink } from "../place/google-maps";
import type { FoundPlace } from "../place/types";
import { useAirports } from "../place/useAirports";
import { MAX_DAYS, MAX_NAME } from "../rooms/newRoom";
import { useWorker } from "../worker/useWorker";

import AirportField from "./AirportField.vue";
import { moveSchedules } from "./apply";
import {
  formOf,
  MAX_FLIGHT_NO,
  newFlight,
  newStay,
  sameFlight,
  sameStays,
  settingsOf,
  stayOf,
  type StayForm,
  type TripForm,
} from "./settings";
import type { Leg, TripSnapshot } from "./types";
import { useTrip } from "./useTrip";

/**
 * The trip's settings, on its home: its name, when it is (the first day and how many days), its
 * flights there and home, and where its nights are spent. Nothing reaches the room until it is
 * saved, and then only what changed. Moving the dates moves what is planned with them; what would fall past the new last
 * day is said before saving, since it goes back to having no day.
 */
const props = defineProps<{ trip: TripSnapshot }>();
const emit = defineEmits<{ close: [] }>();
const i18n = useI18n();
const id = useId();
const { rename, setDates, setFlight, setStays } = useTrip();
const { notes } = useNotes();
const worker = useWorker();

const LEGS: readonly Leg[] = ["out", "back"];
const form = reactive<TripForm>(formOf(props.trip));
const airports = useAirports();
const settings = computed(() => settingsOf(form, airports.value));
const step = (by: number) => (form.days = Math.min(MAX_DAYS, Math.max(1, form.days + by)));

/** How many planned notes the new dates would take off their day */
const dropped = computed(() => {
  const s = settings.value;
  if (s === null) return 0;
  const m = { type: "trip:dates", first: s.first, days: s.days } as const;
  const before = notes.value ?? [];
  const next = moveSchedules(before, props.trip.days[0]?.date, m, Temporal.Now.instant());
  // only a planned note changes, so one that changed and has no day now lost it
  return next.filter((n, i) => n !== before[i] && n.kind === "memo" && n.schedule === null).length;
});

const addFlight = (leg: Leg) => (form.flights[leg] = newFlight());
const removeFlight = (leg: Leg) => (form.flights[leg] = { ...form.flights[leg], on: false });

function addStay() {
  let first: Temporal.PlainDate;
  try {
    first = Temporal.PlainDate.from(form.firstDay);
  } catch {
    first = Temporal.Now.plainDateISO();
  }
  form.stays.push(newStay(form.stays, first));
}
const removeStay = (i: number) => form.stays.splice(i, 1);
/** Which row each stay is, so the rows after one taken out keep their own inputs */
const rows = new WeakMap<StayForm, number>();
let lastRow = 0;
function rowOf(s: StayForm) {
  let row = rows.get(s);
  if (row === undefined) rows.set(s, (row = ++lastRow));
  return row;
}

/** The stays whose short link is on its way to the Worker to be read */
const expanding = reactive(new Set<StayForm>());
/**
 * The link each stay's point was last read from: a paste reads it at once, and leaving the
 * field afterwards (its change) is the same link, not a new one to read again
 */
const readFrom = new WeakMap<StayForm, string>();
for (const s of form.stays) readFrom.set(s, s.mapsUrl.trim());
/**
 * A link changed: its point is read from it alone. A shared short link hides its point, so the
 * Worker reads where it leads, and the link becomes that
 */
function onStayLink(s: StayForm) {
  const short = s.mapsUrl.trim();
  if (readFrom.get(s) === short) return;
  readFrom.set(s, short);
  // a new link: the point the old one had is not this one's
  s.pin = null;
  const api = worker.api;
  if (api === null || !isShortMapsLink(short)) return;
  expanding.add(s);
  api
    .expandLink(short, i18n.locale === "en" ? "en" : "ja")
    .then((answer) => {
      // past the budget the short link stays, as when it could not be read
      if (!answer.ok) return;
      const { url, at } = answer.value;
      if (s.mapsUrl.trim() !== short) return;
      s.mapsUrl = url;
      readFrom.set(s, url);
      // the link's own point when it has one (stayOf reads it), else where its name was found
      if (at !== null) s.pin = at;
    })
    .catch(() => {
      // the short link stays; the hint says it has no point
    })
    .finally(() => expanding.delete(s));
}
/** A paste is read at once, once the field holds it, without waiting for the field to be left */
const onStayPaste = (s: StayForm) => setTimeout(() => onStayLink(s));

/** The stays being looked up by their name, and the places each lookup found */
const finding = reactive(new Set<StayForm>());
const found = reactive(new Map<StayForm, FoundPlace[]>());
/** Places by the stay's name, from OpenStreetMap: free, so a tap is all it takes */
function findStay(s: StayForm) {
  const name = s.name.trim();
  const api = worker.api;
  if (api === null || name === "") return;
  finding.add(s);
  api
    .findByName(name, i18n.locale === "en" ? "en" : "ja")
    .then((places) => found.set(s, places))
    .catch(() => found.set(s, []))
    .finally(() => finding.delete(s));
}
/** The chosen place is the stay's link and its point, as a pasted link would be */
function chooseStay(s: StayForm, p: FoundPlace) {
  s.mapsUrl = placeSearchLink(p.name, p.at);
  readFrom.set(s, s.mapsUrl);
  s.pin = p.at;
  found.delete(s);
}

/** What the link under a stay does: nothing yet, being read, a place on the map, or no place */
function stayLinkState(s: StayForm) {
  if (s.mapsUrl.trim() === "") return "stay.linkHint";
  if (expanding.has(s)) return "stay.linkExpanding";
  const stay = stayOf(s);
  return stay.ok && stay.value.pin !== null ? "stay.linkPinned" : "stay.linkNoPin";
}

function save() {
  const s = settings.value;
  if (s === null) return;
  rename(s.name);
  setDates(s.first, s.days);
  for (const leg of LEGS)
    if (!sameFlight(s.flights[leg], props.trip.flights[leg])) setFlight(leg, s.flights[leg]);
  if (!sameStays(s.stays, props.trip.stays)) setStays(s.stays);
  emit("close");
}
</script>

<template>
  <form class="editor" @submit.prevent="save">
    <CtField :for="`${id}-name`" :label="i18n.t('rooms.name')">
      <CtInput :id="`${id}-name`" v-model="form.name" :maxlength="MAX_NAME" required />
    </CtField>

    <div class="row">
      <CtField :for="`${id}-first`" :label="i18n.t('rooms.firstDay')">
        <CtInput :id="`${id}-first`" v-model="form.firstDay" required type="date" />
      </CtField>
      <CtField :label="i18n.t('rooms.days')">
        <div class="stepper" role="group" :aria-label="i18n.t('rooms.days')">
          <button
            type="button"
            :aria-label="i18n.t('rooms.fewer')"
            :disabled="form.days <= 1"
            @click="() => step(-1)"
          >
            <Icon :size="18" :src="minusIcon" />
          </button>
          <output aria-live="polite">{{ i18n.t("home.days", { count: form.days }) }}</output>
          <button
            type="button"
            :aria-label="i18n.t('rooms.more')"
            :disabled="form.days >= MAX_DAYS"
            @click="() => step(1)"
          >
            <Icon :size="18" :src="plusIcon" />
          </button>
        </div>
      </CtField>
    </div>
    <p v-if="dropped > 0" class="note" role="status">{{
      i18n.t("trip.dropped", { count: dropped })
    }}</p>

    <!-- the flights there and home: each a card of a few fields once added, said once what they need -->
    <p class="hint">{{ i18n.t("flight.localTime") }}</p>
    <fieldset v-for="leg in LEGS" :key="leg" :class="{ card: form.flights[leg].on }">
      <legend>{{ i18n.t(leg === "out" ? "flight.out" : "flight.back") }}</legend>
      <template v-if="form.flights[leg].on">
        <button class="remove" type="button" @click="() => removeFlight(leg)">{{
          i18n.t("flight.remove")
        }}</button>
        <!-- the airports, the one thing a flight needs -->
        <div class="row airports">
          <AirportField
            :id="`${id}-${leg}-from`"
            v-model="form.flights[leg].from"
            :label="i18n.t('flight.from')"
            :placeholder="leg === 'out' ? i18n.t('flight.airportHint') : 'TSA'"
          />
          <AirportField
            :id="`${id}-${leg}-to`"
            v-model="form.flights[leg].to"
            :label="i18n.t('flight.to')"
            :placeholder="leg === 'out' ? 'TSA' : i18n.t('flight.airportHint')"
          />
        </div>
        <CtField :for="`${id}-${leg}-no`" :label="i18n.t('flight.number')">
          <CtInput
            :id="`${id}-${leg}-no`"
            v-model="form.flights[leg].number"
            autocapitalize="characters"
            :maxlength="MAX_FLIGHT_NO"
            :placeholder="leg === 'out' ? 'BR 191' : 'BR 192'"
          />
        </CtField>
        <div class="row">
          <CtField :for="`${id}-${leg}-dep`" :label="i18n.t('flight.departs')">
            <CtInput
              :id="`${id}-${leg}-dep`"
              v-model="form.flights[leg].departs"
              type="datetime-local"
            />
          </CtField>
          <CtField :for="`${id}-${leg}-arr`" :label="i18n.t('flight.arrives')">
            <CtInput
              :id="`${id}-${leg}-arr`"
              v-model="form.flights[leg].arrives"
              type="datetime-local"
            />
          </CtField>
        </div>
      </template>
      <CtButton v-else class="start" variant="blank" @click="() => addFlight(leg)">
        <Icon :size="16" :src="plusIcon" />{{ i18n.t(leg === "out" ? "flight.addOut" : "flight.addBack") }}
      </CtButton>
    </fieldset>

    <!-- where the nights are spent: each a few fields, in the order they come -->
    <fieldset>
      <legend>{{ i18n.t("stay.title") }}</legend>
      <div v-for="(s, i) in form.stays" :key="rowOf(s)" class="stay card">
        <p class="head">{{ i18n.t("stay.nth", { n: i + 1 }) }}</p>
        <button class="remove" type="button" @click="() => removeStay(i)">{{
          i18n.t("stay.remove")
        }}</button>
        <CtField :for="`${id}-stay-${i}-name`" :label="i18n.t('stay.name')">
          <CtInput :id="`${id}-stay-${i}-name`" v-model="s.name" :maxlength="MAX_NAME" required />
        </CtField>
        <!-- or its place found by its name on OpenStreetMap, one chosen: no link needed -->
        <div v-if="worker.api !== null" class="find">
          <CtButton
            class="start"
            :busy="finding.has(s)"
            :disabled="s.name.trim() === '' || finding.has(s)"
            @click="() => findStay(s)"
          >{{ i18n.t(finding.has(s) ? "stay.finding" : "stay.find") }}</CtButton>
          <ul v-if="(found.get(s)?.length ?? 0) > 0">
            <li v-for="p in found.get(s)" :key="`${p.at.lat},${p.at.lng}`">
              <button type="button" @click="() => chooseStay(s, p)"><b>{{ p.name }}</b><small>{{
                  p.address
                }}</small></button>
            </li>
          </ul>
          <p v-if="found.get(s)?.length === 0" aria-live="polite" class="hint">{{
            i18n.t("stay.findNone")
          }}</p>
          <p v-else-if="found.has(s)" class="hint">{{ i18n.t("form.placesCredit") }}</p>
        </div>
        <div class="row">
          <CtField :for="`${id}-stay-${i}-in`" :label="i18n.t('stay.checkIn')">
            <CtInput :id="`${id}-stay-${i}-in`" v-model="s.checkIn" required type="date" />
          </CtField>
          <CtField :for="`${id}-stay-${i}-nights`" :label="i18n.t('stay.nights')">
            <CtInput
              :id="`${id}-stay-${i}-nights`"
              v-model.number="s.nights"
              inputmode="numeric"
              :max="MAX_DAYS"
              min="1"
              required
              type="number"
            />
          </CtField>
        </div>
        <CtField :for="`${id}-stay-${i}-url`" :label="i18n.t('stay.link')">
          <CtInput
            :id="`${id}-stay-${i}-url`"
            v-model="s.mapsUrl"
            inputmode="url"
            type="url"
            @change="() => onStayLink(s)"
            @paste="() => onStayPaste(s)"
          />
        </CtField>
        <p aria-live="polite" class="hint">{{ i18n.t(stayLinkState(s)) }}</p>
      </div>
      <CtButton class="start" variant="blank" @click="addStay"><Icon :size="16" :src="plusIcon" />{{ i18n.t("stay.add") }}</CtButton>
    </fieldset>

    <footer>
      <CtButton size="lg" type="submit" variant="primary" :disabled="settings === null">{{
        i18n.t("trip.save")
      }}</CtButton>
      <CtButton size="lg" @click="() => emit('close')">{{ i18n.t("people.cancel") }}</CtButton>
    </footer>
  </form>
</template>

<style scoped>
@import "../../../ui/styles/media.css";
.editor {
  display: grid;
  gap: 16px;
  padding: 16px;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  /* the fields are set into the card, in the desk's color */
  --field-bg: var(--bg);
}

.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  /* the two airports side by side even on a phone: a code is short, the names wrap under */
  &.airports {
    position: relative; /* the airports offered float under the whole row (AirportField) */
    grid-template-columns: 1fr 1fr;
  }
}

.stepper {
  display: flex;
  align-items: center;
  min-height: 46px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  > button {
    display: grid;
    place-items: center;
    width: 46px;
    align-self: stretch;
    border: 0;
    background: transparent;
    color: var(--ink);
    border-radius: 10px;
    &:disabled {
      color: var(--muted);
      opacity: 0.4;
    }
    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: -2px;
    }
  }
  > output {
    flex: 1;
    text-align: center;
    font-size: var(--font-lg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

fieldset {
  position: relative;
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  border: 0;
  > legend {
    float: left;
    padding: 0;
    font-size: var(--font-md);
    font-weight: 700;
  }
}

/* a flight, or a stay: its fields on a card of their own, so each reads as one thing */
.card {
  padding: 14px;
  border-radius: 14px;
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line);
  /* inside a card the fields sit on the surface again, so they stand out from it */
  --field-bg: var(--surface);
}

/* taking a flight or a stay away: quiet, in the card's corner, the danger's color only on intent */
button.remove {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: var(--font-xs);
  font-weight: 700;
  @media (--can-hover) {
    &:hover {
      color: var(--danger);
      background: var(--wash);
    }
  }
}

/* one stay's fields, a dashed line under each */
/* headed like a flight (which one it is), its remove button in the other corner of that row */
.stay {
  position: relative;
  display: grid;
  gap: 12px;
  > .head {
    margin: 0;
    font-size: var(--font-md);
    font-weight: 700;
  }
}

/* the stay's place found by its name: the ask, then the places to choose, each a line */
.find {
  display: grid;
  gap: 8px;
  > ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
    > li > button {
      display: grid;
      gap: 2px;
      width: 100%;
      min-height: var(--tap);
      padding: 8px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--bg);
      color: var(--ink);
      font: inherit;
      text-align: start;
      > b {
        font-size: var(--font-md);
      }
      > small {
        font-size: var(--font-xs);
        color: var(--muted);
      }
    }
  }
}

.note, .hint {
  margin: 0;
  font-size: var(--font-xs);
  line-height: 1.6;
  color: var(--muted);
}

.note {
  font-size: var(--font-sm);
  color: var(--ink);
}

/* a button in a column of fields keeps to its words, at the start */
.start {
  justify-self: start;
}

footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
