<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import { computed, ref } from "vue";

import { formatMoney } from "../shared/money";

import { useI18n } from "../i18n/useI18n";

import People from "../features/members/People.vue";
import { useMembers } from "../features/members/useMembers";
import { PAPERS } from "../features/notes/types";
import { useNotes } from "../features/notes/useNotes";
import FlightLine from "../features/trip/FlightLine.vue";
import { shortDate, weekday } from "../features/trip/format";
import TripEditor from "../features/trip/TripEditor.vue";
import { useTrip } from "../features/trip/useTrip";

const trip = useTrip();
const store = useNotes();
const members = useMembers();
const i18n = useI18n();
const price = (amount: number) => formatMoney(amount, trip.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);
/** The trip's settings are open under its title */
const editing = ref(false);

/** "11/3 – 11/6", one date for a day trip, or nothing while the room has no days */
const range = computed(() => {
  const first = trip.days[0]?.date;
  const last = trip.days.at(-1)?.date;
  if (first === undefined || last === undefined) return "";
  return first.equals(last) ? short(first) : `${short(first)} – ${short(last)}`;
});

/** Every memo in one of three piles: confirmed (or done), on a day as a maybe, or not on a day yet */
const piles = computed(() => {
  const memos = store.notes.filter((n) => n.kind === "memo");
  const fixed = memos.filter((n) => n.schedule !== null && n.schedule.status !== "idea").length;
  const loose = memos.filter((n) => n.schedule === null).length;
  return { fixed, maybe: memos.length - fixed - loose, loose, total: memos.length };
});
/** A pile's share of the bar, as a flex-grow; an empty desk shows one empty bar */
const share = (count: number) => (piles.value.total === 0 ? 0 : count);

const fixedTotal = computed(() => trip.budgetOf(undefined, true));
const allTotal = computed(() => trip.budgetOf(undefined, false));
</script>

<template>
  <section>
    <div>
      <header>
        <h1>{{ trip.name }}</h1>
        <p v-if="range">{{ range }} · {{ i18n.t("home.days", { count: trip.days.length }) }}</p>
        <!-- who is in: a face each, initial on their color -->
        <ul>
          <li v-for="m in members.members" :key="m.id" :style="`--who: ${m.color}`" :title="m.name">
            <span aria-hidden="true">{{ m.name.slice(0, 1) }}</span>
            <span>{{ m.name }}</span>
          </li>
        </ul>
      </header>

      <!-- how the trip goes: its flights, and the way to change its name, dates and flights -->
      <TripEditor v-if="editing" @close="() => (editing = false)" />
      <div v-else class="plan">
        <FlightLine v-if="trip.flights.out" leg="out" :flight="trip.flights.out" />
        <FlightLine v-if="trip.flights.back" leg="back" :flight="trip.flights.back" />
        <button type="button" @click="() => (editing = true)">{{ i18n.t("trip.edit") }}</button>
      </div>

      <!-- the days side by side, each a stack of its notes in their own paper; maybes faded -->
      <ol v-if="trip.days.length">
        <li
          v-for="d in trip.days"
          :key="d.date.toString()"
          :aria-label="i18n.t('home.day', { date: short(d.date), count: trip.forDay(d.date).length })"
        >
          <div aria-hidden="true">
            <span
              v-for="n in trip.forDay(d.date)"
              :key="n.id"
              :data-maybe="n.schedule.status === 'idea' || undefined"
              :style="`background: ${PAPERS[n.color]}`"
            ></span>
          </div>
          <time aria-hidden="true" :datetime="d.date.toString()">{{ short(d.date) }}<small>{{ weekday(d.date, i18n.locale) }}</small></time>
        </li>
      </ol>

      <!-- how far the plan has come: one bar, three piles -->
      <figure>
        <div aria-hidden="true">
          <span class="confirmed" :style="`flex-grow: ${share(piles.fixed)}`"></span>
          <span class="maybe" :style="`flex-grow: ${share(piles.maybe)}`"></span>
          <span class="loose" :style="`flex-grow: ${share(piles.loose)}`"></span>
        </div>
        <ul>
          <li class="confirmed"><span aria-hidden="true"></span>{{ i18n.t("home.fixed") }}<b>{{ piles.fixed }}</b></li>
          <li class="maybe"><span aria-hidden="true"></span>{{ i18n.t("home.maybe") }}<b>{{ piles.maybe }}</b></li>
          <li class="loose"><span aria-hidden="true"></span>{{ i18n.t("home.loose") }}<b>{{ piles.loose }}</b></li>
        </ul>
      </figure>

      <p><small>{{ i18n.t("home.budget") }}</small>{{ price(fixedTotal) }}<small v-if="allTotal > fixedTotal">{{ i18n.t("shiori.withMaybes", { total: price(allTotal) }) }}</small></p>

      <People />
    </div>
  </section>
</template>

<style scoped>
@import "../../ui/styles/media.css";

section {
  position: absolute;
  inset: 0;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  background: var(--bg);

  > div {
    flex: 1;
    overflow-y: auto;
    padding: var(--page-top) var(--page-margin) calc(var(--dock-clear) + 24px);
    display: flex;
    flex-direction: column;
    gap: 28px;

    /* the flights, one ticket strip each, and the way into the trip's settings under them */
    > .plan {
      display: grid;
      gap: 8px;

      > button {
        justify-self: start;
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
      }
    }

    > header {
      > h1 {
        margin: 0;
        font-size: var(--font-display);
        font-weight: 700;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      > p {
        margin: 6px 0 0;
        font-size: var(--font-md);
        font-weight: 700;
        color: var(--muted);
        font-variant-numeric: tabular-nums;
      }

      > ul {
        list-style: none;
        margin: 16px 0 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;

        > li {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;

          /* the member's own color, deepened enough to carry white */
          > span:first-child {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: oklch(from var(--who) min(l, 0.52) c h);
            color: var(--on-tint);
            font-size: var(--font-lg);
            font-weight: 700;
          }

          > span:last-child {
            font-size: var(--font-xs);
            color: var(--muted);
          }
        }
      }
    }

    /* one column per day, its notes stacked from the bottom like paper on a spike */
    > ol {
      list-style: none;
      margin: 0;
      padding: 16px 12px 12px;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      gap: 8px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;

      > li {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;

        > div {
          min-height: 96px;
          width: 100%;
          display: flex;
          flex-direction: column-reverse;
          align-items: center;
          gap: 3px;
          padding-block-end: 6px;
          border-block-end: 1px solid var(--line);

          > span {
            width: min(44px, 100%);
            height: 14px;
            border-radius: 3px;
            box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--paper-ink) 14%, transparent);

            /* a maybe: the same paper, faded, on a dashed edge (white paper would vanish by fading alone) */
            &[data-maybe] {
              opacity: 0.6;
              box-shadow: none;
              outline: 1px dashed color-mix(in oklch, var(--paper-ink) 45%, transparent);
              outline-offset: -1px;
            }
          }
        }

        > time {
          display: flex;
          flex-direction: column;
          align-items: center;
          font-size: var(--font-sm);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1.2;

          > small {
            font-size: var(--font-xs);
            font-weight: 400;
            color: var(--muted);
          }
        }
      }
    }

    > figure {
      margin: 0;

      /* each pile's ink, shared by its piece of the bar and its key */
      .confirmed {
        --key: var(--ink);
      }

      .maybe {
        --key: color-mix(in oklch, var(--ink) 35%, var(--bg));
      }

      .loose {
        --key: color-mix(in oklch, var(--ink) 12%, var(--bg));
      }

      > div {
        display: flex;
        gap: 2px;
        height: 10px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--line);

        > span {
          flex-basis: 0;
          background: var(--key);
        }
      }

      > ul {
        list-style: none;
        margin: 10px 0 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 4px 16px;
        font-size: var(--font-sm);
        color: var(--muted);

        > li {
          display: flex;
          align-items: center;
          gap: 6px;

          > span {
            width: 10px;
            height: 10px;
            border-radius: 3px;
            background: var(--key);
          }

          > b {
            color: var(--ink);
            font-variant-numeric: tabular-nums;
          }
        }
      }
    }

    > p {
      margin: 0;
      font-size: var(--font-4xl);
      font-weight: 700;
      font-variant-numeric: tabular-nums;

      > small {
        margin-inline-start: 8px;
        font-size: var(--font-sm);
        font-weight: 400;
        color: var(--muted);

        &:first-child {
          margin-inline: 0 8px;
          font-weight: 700;
        }
      }
    }
  }
}
</style>
