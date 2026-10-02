<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { CtAppBar } from "../../ui/index";

import { formatMoney } from "../shared/money";

import { useI18n } from "../i18n/useI18n";

import { useMembers } from "../features/members/useMembers";
import { PAPERS } from "../features/notes/types";
import { useNotes } from "../features/notes/useNotes";
import { useRoom } from "../features/sync/useRoom";
import { shortDate, weekday } from "../features/trip/format";
import { useTrip } from "../features/trip/useTrip";

const trip = useTrip();
const store = useNotes();
const members = useMembers();
const room = useRoom();
const i18n = useI18n();
const price = (amount: number) => formatMoney(amount, trip.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);

/** "11/3 – 11/6", or nothing while the room has no days */
const range = computed(() => {
  const first = trip.days[0]?.date;
  const last = trip.days.at(-1)?.date;
  if (first === undefined || last === undefined) return "";
  return `${short(first)} – ${short(last)}`;
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
  <div class="home">
    <CtAppBar><p class="wordmark">chirashitabi</p></CtAppBar>

    <main class="body">
      <header class="trip">
        <h1>{{ trip.name }}</h1>
        <p v-if="range" class="dates">{{ range }} · {{ i18n.t("home.days", { count: trip.days.length }) }}</p>
        <!-- who is in: a face each, initial on their color -->
        <ul class="faces">
          <li v-for="m in members.members" :key="m.id" :style="`--who: ${m.color}`" :title="m.name">
            <span aria-hidden="true" class="face">{{ m.name.slice(0, 1) }}</span>
            <span class="name">{{ m.name }}</span>
          </li>
        </ul>
      </header>

      <!-- the days side by side, each a stack of its notes in their own paper; maybes faded -->
      <ol v-if="trip.days.length" class="days">
        <li
          v-for="d in trip.days"
          :key="d.date.toString()"
          :aria-label="i18n.t('home.day', { date: short(d.date), count: trip.forDay(d.date).length })"
        >
          <div aria-hidden="true" class="stack">
            <span
              v-for="n in trip.forDay(d.date)"
              :key="n.id"
              class="paper"
              :class="{ maybe: n.schedule.status === 'idea' }"
              :style="`background: ${PAPERS[n.color]}`"
            ></span>
          </div>
          <span aria-hidden="true" class="date">{{ short(d.date) }}<small>{{ weekday(d.date, i18n.locale) }}</small></span>
        </li>
      </ol>

      <!-- how far the plan has come: one bar, three piles -->
      <section class="progress">
        <div aria-hidden="true" class="bar">
          <span class="confirmed" :style="`flex-grow: ${share(piles.fixed)}`"></span>
          <span class="maybe" :style="`flex-grow: ${share(piles.maybe)}`"></span>
          <span class="loose" :style="`flex-grow: ${share(piles.loose)}`"></span>
        </div>
        <ul class="legend">
          <li class="confirmed"><span aria-hidden="true" class="key"></span>{{ i18n.t("home.fixed") }}<b>{{ piles.fixed }}</b></li>
          <li class="maybe"><span aria-hidden="true" class="key"></span>{{ i18n.t("home.maybe") }}<b>{{ piles.maybe }}</b></li>
          <li class="loose"><span aria-hidden="true" class="key"></span>{{ i18n.t("home.loose") }}<b>{{ piles.loose }}</b></li>
        </ul>
      </section>

      <p class="budget"><small class="what">{{ i18n.t("home.budget") }}</small>{{ price(fixedTotal) }}<small v-if="allTotal > fixedTotal">{{ i18n.t("shiori.withMaybes", { total: price(allTotal) }) }}</small></p>

      <button class="leave" type="button" @click="() => room.leave()">{{ i18n.t("home.leave") }}</button>
    </main>
  </div>
</template>

<style scoped>
.home {
  position: absolute;
  inset: 0;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.wordmark {
  margin: 0;
  padding-inline: 16px;
  font-size: var(--font-2xl);
  font-weight: 700;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 28px max(16px, calc((100% - 648px) / 2)) 32px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.trip {
  & h1 {
    margin: 0;
    font-size: var(--font-display);
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  & .dates {
    margin: 6px 0 0;
    font-size: var(--font-md);
    font-weight: 700;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
}

.faces {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  & li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  /* the member's own color, deepened enough to carry white */
  & .face {
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
  & .name {
    font-size: var(--font-xs);
    color: var(--muted);
  }
}

/* one column per day, its notes stacked from the bottom like paper on a spike */
.days {
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
  & li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  & .stack {
    min-height: 96px;
    width: 100%;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 3px;
    padding-block-end: 6px;
    border-block-end: 1px solid var(--line);
  }
  & .paper {
    width: min(44px, 100%);
    height: 14px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--paper-ink) 14%, transparent);
    /* a maybe: the same paper, faded, on a dashed edge (white paper would vanish by fading alone) */
    &.maybe {
      opacity: 0.6;
      box-shadow: none;
      outline: 1px dashed color-mix(in oklch, var(--paper-ink) 45%, transparent);
      outline-offset: -1px;
    }
  }
  & .date {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: var(--font-sm);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    & small {
      font-size: var(--font-xs);
      font-weight: 400;
      color: var(--muted);
    }
  }
}

.progress {
  & .bar {
    display: flex;
    gap: 2px;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--line);
    & span {
      flex-basis: 0;
    }
  }
  & .confirmed {
    --key: var(--ink);
  }
  & .maybe {
    --key: color-mix(in oklch, var(--ink) 35%, var(--bg));
  }
  & .loose {
    --key: color-mix(in oklch, var(--ink) 12%, var(--bg));
  }
  & .bar span {
    background: var(--key);
  }
  & .legend {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: var(--font-sm);
    color: var(--muted);
    & li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    & .key {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      background: var(--key);
    }
    & b {
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }
  }
}

.budget {
  margin: 0;
  font-size: var(--font-4xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  & small {
    margin-inline-start: 8px;
    font-size: var(--font-sm);
    font-weight: 400;
    color: var(--muted);
    &.what {
      margin-inline: 0 8px;
      font-weight: 700;
    }
  }
}

.leave {
  align-self: flex-start;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
  @media (hover: hover) {
    &:hover {
      color: var(--ink);
    }
  }
}
</style>
