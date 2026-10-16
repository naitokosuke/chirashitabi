<script setup lang="ts" generic="T extends Temporal.PlainDate | DateRange" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, nextTick, ref, useTemplateRef } from "vue";

import { pick, weeksOf, type DateRange } from "./calendar";

/**
 * A month of days to pick one from (after Nuxt UI's Calendar). With `range`, a stretch of
 * them: the first day tapped, then the last, the days between them banded, and until the
 * last is picked the band follows the pointer (or the focus) from the first. A day before
 * the first, or past `maxDays` from it, starts over from there. The arrow keys walk the days.
 */
const props = defineProps<{
  /** a day, or with `range` a DateRange */
  modelValue: T;
  range?: boolean;
  maxDays?: number;
  locale: string;
  prevLabel: string;
  nextLabel: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: T] }>();

/** What is picked, as a range either way: one day is a range of it alone */
const picked = computed<DateRange>(() => {
  if (props.range) return props.modelValue as DateRange;
  const day = props.modelValue as Temporal.PlainDate;
  return { start: day, end: day };
});
const maxDays = computed(() => props.maxDays ?? Infinity);

const today = Temporal.Now.plainDateISO();
const month = ref(picked.value.start.toPlainYearMonth());
const weeks = computed(() => weeksOf(month.value));
/** A day of the month on the page; the days of the months either side are left blank */
const shown = (day: Temporal.PlainDate) => day.month === month.value.month;
const title = computed(() =>
  month.value
    .toPlainDate({ day: 1 })
    .toLocaleString(props.locale, { year: "numeric", month: "long" }),
);
/** "日 月 火 …", a week from a Sunday */
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    Temporal.PlainDate.from("2026-11-01")
      .add({ days: i })
      .toLocaleString(props.locale, { weekday: "short" }),
  ),
);

/** The day the band runs to while the last is still to be picked */
const hovered = ref<Temporal.PlainDate | null>(null);
/** The day the arrow keys walk from: the one day in the month Tab lands on */
const focused = ref(picked.value.start);

const cmp = Temporal.PlainDate.compare;
/** The band's last day: the range's, else the day under the pointer while it would make one */
const bandEnd = computed(() => {
  const { start, end } = picked.value;
  if (end !== null) return end;
  const h = hovered.value;
  return h !== null && cmp(h, start) >= 0 && start.until(h).days < maxDays.value ? h : start;
});
const stateOf = (day: Temporal.PlainDate) => {
  const { start } = picked.value;
  const end = bandEnd.value;
  return {
    start: day.equals(start),
    end: day.equals(end),
    within: cmp(day, start) > 0 && cmp(day, end) < 0,
    // the band runs on past this end, so it reaches across the cell
    spans: cmp(start, end) < 0,
  };
};

const choose = (day: Temporal.PlainDate) => {
  focused.value = day;
  emit("update:modelValue", (props.range ? pick(picked.value, day, maxDays.value) : day) as T);
};
const turn = (by: number) => {
  month.value = month.value.add({ months: by });
  focused.value = month.value.toPlainDate({ day: 1 });
};

const grid = useTemplateRef<HTMLElement>("grid");
const STEPS: Record<string, Temporal.DurationLike> = {
  ArrowLeft: { days: -1 },
  ArrowRight: { days: 1 },
  ArrowUp: { days: -7 },
  ArrowDown: { days: 7 },
  PageUp: { months: -1 },
  PageDown: { months: 1 },
};
async function walk(e: KeyboardEvent, day: Temporal.PlainDate) {
  const step = STEPS[e.key];
  if (step === undefined) return;
  e.preventDefault();
  const next = day.add(step);
  focused.value = next;
  hovered.value = next;
  month.value = next.toPlainYearMonth();
  await nextTick();
  grid.value?.querySelector<HTMLElement>(`[data-date="${next.toString()}"]`)?.focus();
}
</script>

<template>
  <div class="calendar">
    <header>
      <button type="button" :aria-label="prevLabel" @click="() => turn(-1)">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <h3 aria-live="polite">{{ title }}</h3>
      <button type="button" :aria-label="nextLabel" @click="() => turn(1)">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </header>
    <table ref="grid" role="grid" :aria-label="title" @pointerleave="() => (hovered = null)">
      <thead>
        <tr>
          <th v-for="w in weekdays" :key="w" scope="col">{{ w }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="week in weeks" :key="week[0].toString()">
          <td
            v-for="day in week"
            :key="day.toString()"
            :data-start="shown(day) && stateOf(day).start ? '' : undefined"
            :data-end="shown(day) && stateOf(day).end ? '' : undefined"
            :data-within="shown(day) && stateOf(day).within ? '' : undefined"
            :data-spans="shown(day) && stateOf(day).spans ? '' : undefined"
          >
            <button
              v-if="shown(day)"
              type="button"
              :data-date="day.toString()"
              :tabindex="day.equals(focused) ? 0 : -1"
              :aria-pressed="stateOf(day).start || stateOf(day).end || stateOf(day).within"
              :aria-current="day.equals(today) ? 'date' : undefined"
              :aria-label="
                day.toLocaleString(locale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })
              "
              @click="() => choose(day)"
              @pointerenter="() => (hovered = day)"
              @focus="() => (hovered = day)"
              @keydown="(e) => walk(e, day)"
            >
              {{ day.day }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

.calendar {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  > h3 {
    margin: 0;
    font-size: var(--font-base);
    font-weight: 700;
  }

  > button {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ink);

    > svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: -2px;
    }

    @media (--can-hover) {
      &:hover {
        background: var(--wash);
      }
    }
  }
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th {
  padding-block-end: 4px;
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--muted);
}

/*
 * The band: the days between the ends washed across their whole cell, each end washed on
 * the side the band runs on, so it reads as one stroke from the first day to the last
 */
td {
  padding: 2px 0;
  background-clip: content-box;

  &[data-within] {
    background-color: var(--wash);
  }
  &[data-spans][data-start] {
    background-image: linear-gradient(to right, transparent 50%, var(--wash) 50%);
  }
  &[data-spans][data-end] {
    background-image: linear-gradient(to left, transparent 50%, var(--wash) 50%);
  }

  > button {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 44px;
    aspect-ratio: 1;
    margin-inline: auto;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ink);
    font-size: var(--font-md);
    font-variant-numeric: tabular-nums;

    /* today: its number underlined */
    &[aria-current="date"] {
      font-weight: 700;
      text-decoration: underline 2px;
      text-underline-offset: 4px;
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: -2px;
    }

    @media (--can-hover) {
      &:hover {
        box-shadow: inset 0 0 0 1px var(--ink);
      }
    }
  }

  /* the two ends: the ink fill, the one "on" color */
  &[data-start] > button,
  &[data-end] > button {
    background: var(--ink);
    color: var(--on-ink);
    font-weight: 700;

    &:focus-visible {
      outline-offset: 2px;
    }
  }
}
</style>
