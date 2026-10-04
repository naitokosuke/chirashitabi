<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, reactive, useId } from "vue";

import { useI18n } from "../../i18n/useI18n";

import minusIcon from "../../icons/minus.svg";
import Icon from "../../icons/Icon.vue";
import plusIcon from "../../icons/plus.svg";
import { useNotes } from "../notes/useNotes";
import { MAX_DAYS, MAX_NAME } from "../rooms/newRoom";

import { moveSchedules } from "./apply";
import {
  formOf,
  MAX_FLIGHT_NO,
  MAX_PLACE,
  newFlight,
  sameFlight,
  settingsOf,
  type TripForm,
} from "./settings";
import type { Leg } from "./types";
import { useTrip } from "./useTrip";

/**
 * The trip's settings, on its home: its name, when it is (the first day and how many days) and
 * its flights there and home. Nothing reaches the room until it is saved, and then only what
 * changed. Moving the dates moves what is planned with them; what would fall past the new last
 * day is said before saving, since it goes back to having no day.
 */
const emit = defineEmits<{ close: [] }>();
const i18n = useI18n();
const id = useId();
const trip = useTrip();
const store = useNotes();

const LEGS: readonly Leg[] = ["out", "back"];
const form = reactive<TripForm>(
  formOf({
    name: trip.name,
    days: trip.days,
    currency: trip.currency,
    center: trip.center ?? { lat: 0, lng: 0 },
    flights: trip.flights,
  }),
);
const settings = computed(() => settingsOf(form));
const step = (by: number) => (form.days = Math.min(MAX_DAYS, Math.max(1, form.days + by)));

/** How many planned notes the new dates would take off their day */
const dropped = computed(() => {
  const s = settings.value;
  if (s === null) return 0;
  const m = { type: "trip:dates", first: s.first, days: s.days } as const;
  const before = store.notes;
  const next = moveSchedules(before, trip.days[0]?.date, m, Temporal.Now.instant());
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

function save() {
  const s = settings.value;
  if (s === null) return;
  trip.rename(s.name);
  trip.setDates(s.first, s.days);
  for (const leg of LEGS)
    if (!sameFlight(s.flights[leg], trip.flights[leg])) trip.setFlight(leg, s.flights[leg]);
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

.note,
.hint {
  margin: 0;
  font-size: var(--font-xs);
  line-height: 1.6;
  color: var(--muted);
}

.note {
  font-size: var(--font-sm);
  color: var(--ink);
}

button.add,
button.quiet,
button.primary {
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
