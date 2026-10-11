<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, reactive, useId } from "vue";

import { useI18n } from "../../i18n/useI18n";

import Icon from "../../icons/Icon.vue";
import minusIcon from "../../icons/minus.svg";
import plusIcon from "../../icons/plus.svg";
import { useNotes } from "../notes/useNotes";
import { isShortMapsLink } from "../place/google-maps";
import { MAX_DAYS, MAX_NAME } from "../rooms/newRoom";
import { useWorker } from "../worker/useWorker";

import { moveSchedules } from "./apply";
import {
  formOf,
  MAX_FLIGHT_NO,
  MAX_PLACE,
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
const settings = computed(() => settingsOf(form));
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

function addFlight(leg: Leg) {
  const s = settings.value;
  let first = s?.first;
  if (first === undefined)
    try {
      first = Temporal.PlainDate.from(form.firstDay);
    } catch {
      first = Temporal.Now.plainDateISO();
    }
  form.flights[leg] = newFlight(leg, first, form.days);
}
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

/** The stays whose short link is on its way to the Worker to be read */
const expanding = reactive(new Set<StayForm>());
/**
 * A link changed: its point is read from it alone. A shared short link hides its point, so the
 * Worker reads where it leads, and the link becomes that
 */
function onStayLink(s: StayForm) {
  // a new link: the point the old one had is not this one's
  s.pin = null;
  const short = s.mapsUrl.trim();
  const api = worker.api;
  if (api === null || !isShortMapsLink(short)) return;
  expanding.add(s);
  api
    .expandLink(short, i18n.locale === "en" ? "en" : "ja")
    .then(({ url, at }) => {
      if (s.mapsUrl.trim() !== short) return;
      s.mapsUrl = url;
      // the link's own point when it has one (stayOf reads it), else where its name was found
      if (at !== null) s.pin = at;
    })
    .catch(() => {
      // the short link stays; the hint says it has no point
    })
    .finally(() => expanding.delete(s));
}
/** What the link under a stay does: nothing yet, being read, a place on the map, or no place */
function stayLinkState(s: StayForm) {
  if (s.mapsUrl.trim() === "") return "stay.linkHint";
  if (expanding.has(s)) return "stay.linkExpanding";
  return (stayOf(s)?.pin ?? null) === null ? "stay.linkNoPin" : "stay.linkPinned";
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
    <div class="field">
      <label :for="`${id}-name`">{{ i18n.t("rooms.name") }}</label>
      <input :id="`${id}-name`" v-model="form.name" :maxlength="MAX_NAME" required />
    </div>

    <div class="row">
      <div class="field">
        <label :for="`${id}-first`">{{ i18n.t("rooms.firstDay") }}</label>
        <input :id="`${id}-first`" v-model="form.firstDay" required type="date" />
      </div>
      <div class="field">
        <span :id="`${id}-days`">{{ i18n.t("rooms.days") }}</span>
        <div class="stepper" role="group" :aria-labelledby="`${id}-days`">
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
      </div>
    </div>
    <p v-if="dropped > 0" class="note" role="status">{{ i18n.t("trip.dropped", { count: dropped }) }}</p>

    <!-- the flights there and home: each a few fields once added -->
    <fieldset v-for="leg in LEGS" :key="leg">
      <legend>{{ i18n.t(leg === "out" ? "flight.out" : "flight.back") }}</legend>
      <template v-if="form.flights[leg].on">
        <div class="row three">
          <div class="field">
            <label :for="`${id}-${leg}-no`">{{ i18n.t("flight.number") }}</label>
            <input
              :id="`${id}-${leg}-no`"
              v-model="form.flights[leg].number"
              autocapitalize="characters"
              :maxlength="MAX_FLIGHT_NO"
              :placeholder="leg === 'out' ? 'BR 191' : 'BR 192'"
            />
          </div>
          <div class="field">
            <label :for="`${id}-${leg}-from`">{{ i18n.t("flight.from") }}</label>
            <input
              :id="`${id}-${leg}-from`"
              v-model="form.flights[leg].from"
              :maxlength="MAX_PLACE"
              :placeholder="leg === 'out' ? 'HND' : 'TSA'"
              required
            />
          </div>
          <div class="field">
            <label :for="`${id}-${leg}-to`">{{ i18n.t("flight.to") }}</label>
            <input
              :id="`${id}-${leg}-to`"
              v-model="form.flights[leg].to"
              :maxlength="MAX_PLACE"
              :placeholder="leg === 'out' ? 'TSA' : 'HND'"
              required
            />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label :for="`${id}-${leg}-dep`">{{ i18n.t("flight.departs") }}</label>
            <input
              :id="`${id}-${leg}-dep`"
              v-model="form.flights[leg].departs"
              required
              type="datetime-local"
            />
          </div>
          <div class="field">
            <label :for="`${id}-${leg}-arr`">{{ i18n.t("flight.arrives") }}</label>
            <input
              :id="`${id}-${leg}-arr`"
              v-model="form.flights[leg].arrives"
              required
              type="datetime-local"
            />
          </div>
        </div>
        <p class="hint">{{ i18n.t("flight.localTime") }}</p>
        <button class="quiet" type="button" @click="() => removeFlight(leg)">{{ i18n.t("flight.remove") }}</button>
      </template>
      <button v-else class="add" type="button" @click="() => addFlight(leg)">
        <Icon :size="16" :src="plusIcon" />{{ i18n.t(leg === "out" ? "flight.addOut" : "flight.addBack") }}
      </button>
    </fieldset>

    <!-- where the nights are spent: each a few fields, in the order they come -->
    <fieldset>
      <legend>{{ i18n.t("stay.title") }}</legend>
      <div v-for="(s, i) in form.stays" :key="i" class="stay">
        <div class="field">
          <label :for="`${id}-stay-${i}-name`">{{ i18n.t("stay.name") }}</label>
          <input :id="`${id}-stay-${i}-name`" v-model="s.name" :maxlength="MAX_NAME" required />
        </div>
        <div class="row">
          <div class="field">
            <label :for="`${id}-stay-${i}-in`">{{ i18n.t("stay.checkIn") }}</label>
            <input :id="`${id}-stay-${i}-in`" v-model="s.checkIn" required type="date" />
          </div>
          <div class="field">
            <label :for="`${id}-stay-${i}-nights`">{{ i18n.t("stay.nights") }}</label>
            <input
              :id="`${id}-stay-${i}-nights`"
              v-model.number="s.nights"
              inputmode="numeric"
              :max="MAX_DAYS"
              min="1"
              required
              type="number"
            />
          </div>
        </div>
        <div class="field">
          <label :for="`${id}-stay-${i}-url`">{{ i18n.t("stay.link") }}</label>
          <input
            :id="`${id}-stay-${i}-url`"
            v-model="s.mapsUrl"
            inputmode="url"
            type="url"
            @change="() => onStayLink(s)"
          />
        </div>
        <p aria-live="polite" class="hint">{{ i18n.t(stayLinkState(s)) }}</p>
        <button class="quiet" type="button" @click="() => removeStay(i)">{{ i18n.t("stay.remove") }}</button>
      </div>
      <button class="add" type="button" @click="addStay"><Icon :size="16" :src="plusIcon" />{{ i18n.t("stay.add") }}</button>
    </fieldset>

    <footer>
      <button class="primary" type="submit" :disabled="settings === null">{{ i18n.t("trip.save") }}</button>
      <button class="quiet" type="button" @click="() => emit('close')">{{ i18n.t("people.cancel") }}</button>
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
}

.field {
  display: grid;
  gap: 6px;
  min-width: 0;
  > label,
  > span {
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
  }
  > input {
    min-width: 0;
    min-height: 46px;
    padding: 10px 12px;
    font: inherit;
    font-size: var(--font-lg);
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    &::placeholder {
      color: var(--muted);
    }
    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
  }
}

.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  &.three {
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
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
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 14px 0 0;
  border: 0;
  border-block-start: 1px solid var(--line);
  > legend {
    float: left;
    padding: 0;
    font-size: var(--font-md);
    font-weight: 700;
  }
}

/* one stay's fields, a dashed line under each */
.stay {
  display: grid;
  gap: 12px;
  padding-block-end: 12px;
  border-block-end: 1px dashed var(--line);
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

button.add, button.quiet, button.primary {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap);
  padding: 0 14px;
  border-radius: 999px;
  border: 0;
  background: var(--wash);
  color: var(--ink);
  font: inherit;
  font-size: var(--font-sm);
  font-weight: 700;

  &:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.35;
  }
}

/* a flight still to add: the outline of a button, as the blank luggage tag is of a tag */
button.add {
  background: transparent;
  border: 1.5px dashed color-mix(in oklch, var(--ink) 28%, transparent);
  color: var(--muted);
}

footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  > button.primary {
    min-height: 46px;
    padding: 0 22px;
    font-size: var(--font-base);
    background: var(--ink);
    color: var(--on-ink);
  }
}
</style>
