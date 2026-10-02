<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { CtAppBar } from "../../ui/index";

import { formatMoney } from "../shared/money";

import { useI18n } from "../i18n/useI18n";

import { useMembers } from "../features/members/useMembers";
import { useNotes } from "../features/notes/useNotes";
import { useRoom } from "../features/sync/useRoom";
import { longDate, shortDate } from "../features/trip/format";
import { useTrip } from "../features/trip/useTrip";

const trip = useTrip();
const store = useNotes();
const members = useMembers();
const room = useRoom();
const i18n = useI18n();
const price = (amount: number) => formatMoney(amount, trip.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);

/** "11/3(火) – 11/6(金)", or nothing while the room has no days */
const range = computed(() => {
  const first = trip.days[0]?.date;
  const last = trip.days.at(-1)?.date;
  if (first === undefined || last === undefined) return "";
  return `${longDate(first, i18n.locale)} – ${longDate(last, i18n.locale)}`;
});
const memos = computed(() => store.notes.filter((n) => n.kind === "memo"));
const withDay = computed(() => memos.value.filter((n) => n.schedule !== null).length);
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
      </header>

      <section>
        <h2>{{ i18n.t("home.members") }}</h2>
        <ul class="members">
          <li v-for="m in members.members" :key="m.id" :style="`--who: ${m.color}`">
            <span aria-hidden="true" class="dot"></span>{{ m.name }}<small v-if="m.id === members.me">{{ i18n.t("home.you") }}</small>
          </li>
        </ul>
      </section>

      <section>
        <h2>{{ i18n.t("home.notes") }}</h2>
        <dl class="rows">
          <div><dt>{{ i18n.t("home.all") }}</dt><dd>{{ i18n.t("home.count", { count: memos.length }) }}</dd></div>
          <div><dt>{{ i18n.t("home.withDay") }}</dt><dd>{{ i18n.t("home.count", { count: withDay }) }}</dd></div>
          <div><dt>{{ i18n.t("home.fixed") }}</dt><dd>{{ i18n.t("home.count", { count: trip.fixedCount }) }}</dd></div>
          <div><dt>{{ i18n.t("home.budget") }}</dt><dd>{{ price(fixedTotal) }}<small v-if="allTotal > fixedTotal">{{ i18n.t("shiori.withMaybes", { total: price(allTotal) }) }}</small></dd></div>
        </dl>
      </section>

      <section v-if="trip.days.length">
        <h2>{{ i18n.t("home.byDay") }}</h2>
        <dl class="rows">
          <div v-for="d in trip.days" :key="d.date.toString()">
            <dt>{{ i18n.t("shiori.dayTab", { n: trip.dayNumber(d.date), date: short(d.date) }) }}</dt>
            <dd>{{ i18n.t("home.count", { count: trip.forDay(d.date).length }) }}</dd>
          </div>
        </dl>
      </section>

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
}

.trip {
  margin-block-end: 28px;
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
    color: var(--muted);
  }
}

section + section {
  margin-block-start: 24px;
}

h2 {
  margin: 0 0 8px;
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
}

.members {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  & li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: var(--tap);
    font-size: var(--font-base);
    font-weight: 700;
  }
  & .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--who);
  }
  & small {
    font-size: var(--font-xs);
    font-weight: 400;
    color: var(--muted);
  }
}

/* a plain list on a white panel: label at the start, the figure at the end */
.rows {
  margin: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;

  & div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;

    & + div {
      border-block-start: 1px solid var(--line);
    }
  }

  & dt {
    font-size: var(--font-base);
  }

  & dd {
    margin: 0;
    font-size: var(--font-base);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: end;

    & small {
      display: block;
      font-size: var(--font-xs);
      font-weight: 400;
      color: var(--muted);
    }
  }
}

.leave {
  margin-block-start: 32px;
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
