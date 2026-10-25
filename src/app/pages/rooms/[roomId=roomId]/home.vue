<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, ref } from "vue";

import { useRoute, useRouter } from "vue-router";

import { CtAmount, CtAvatar, CtButton, CtHeading, CtPanel, CtShareBar } from "../../../../ui/index";

import { formatMoney } from "../../../shared/money";

import { useI18n } from "../../../i18n/useI18n";

import { usePlace } from "../../../features/canvas/usePlace";
import { paperOf } from "../../../features/members/paper";
import People from "../../../features/members/People.vue";
import { useMembers } from "../../../features/members/useMembers";
import type { NoteId } from "../../../features/notes/id";
import { blankInput } from "../../../features/notes/input";
import { TODO_TAG, type Note } from "../../../features/notes/types";
import { useNotes } from "../../../features/notes/useNotes";
import { whenOf } from "../../../features/rooms/when";
import Todos from "../../../features/todos/Todos.vue";
import FlightLine from "../../../features/trip/FlightLine.vue";
import { shortDate, weekday } from "../../../features/trip/format";
import StayLine from "../../../features/trip/StayLine.vue";
import TripEditor from "../../../features/trip/TripEditor.vue";
import { useTrip } from "../../../features/trip/useTrip";
import { queryOf } from "../url";

const { trip, forDay, budgetOf } = useTrip();
const { notes } = useNotes();
const { members } = useMembers();
/** A note's paper: whoever wrote it */
const paperFor = (n: Note) => paperOf(members.value?.find((m) => m.id === n.by)?.color);
const i18n = useI18n();
const router = useRouter();
const route = useRoute("/rooms/[roomId=roomId]/home");
const place = usePlace();
/** A to-do written on the home goes on the desk like any note, tagged To do */
const addTodo = (title: string) => void place({ ...blankInput([TODO_TAG], null), title }, "quiet");
/** Its note opens over the home, where its day and who is to do it are set */
const openNote = (id: NoteId) =>
  void router.push({
    name: "/rooms/[roomId=roomId]/home",
    params: { roomId: route.params.roomId, ...queryOf({ kind: "edit", id }) },
  });
/** Out of the trip (left, or deleted): back to the trips */
const toTrips = () => void router.replace("/");
const price = (amount: number) =>
  trip.value === undefined ? "" : formatMoney(amount, trip.value.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);
/** The trip's settings are open under its title */
const editing = ref(false);

/** "11/3 – 11/6", one date for a day trip, or nothing while the room has no days */
const range = computed(() => {
  const first = trip.value?.days[0]?.date;
  const last = trip.value?.days.at(-1)?.date;
  if (first === undefined || last === undefined) return "";
  return first.equals(last) ? short(first) : `${short(first)} – ${short(last)}`;
});

/** Before the trip (or while it has no days yet), what there is to do before it comes first */
const ahead = computed(() => {
  const days = trip.value?.days ?? [];
  const when = whenOf(
    { first: days[0]?.date ?? null, days: days.length },
    Temporal.Now.plainDateISO(),
  );
  return when.kind === "ahead" || when.kind === "undated";
});

/** Every memo in one of three piles: confirmed (or done), on a day as a maybe, or not on a day yet */
const piles = computed(() => {
  const memos = (notes.value ?? []).filter((n) => n.kind === "memo");
  const fixed = memos.filter((n) => n.schedule !== null && n.schedule.status !== "idea").length;
  const loose = memos.filter((n) => n.schedule === null).length;
  return { fixed, maybe: memos.length - fixed - loose, loose };
});

const fixedTotal = computed(() => budgetOf(undefined, true));
const allTotal = computed(() => budgetOf(undefined, false));
</script>

<template>
  <section>
    <!-- a phone: one column; a computer: the plan on the main column, to-dos and people beside it -->
    <div :class="{ ahead }">
      <header>
        <CtHeading as="h1" level="page">{{ trip?.name }}</CtHeading>
        <p v-if="range !== ''"
        >{{ range }} · {{ i18n.t("home.days", { count: trip?.days.length ?? 0 }) }}</p>
        <!-- who is in: a face each, initial on their color -->
        <ul>
          <li v-for="m in members" :key="m.id" :title="m.name">
            <CtAvatar :color="m.color" :name="m.name" size="lg" />
            <span>{{ m.name }}</span>
          </li>
        </ul>
      </header>

      <div class="main">
        <!-- how the trip goes: its flights and stays, and the way to change them, its name and dates -->
        <div class="plan">
          <TripEditor v-if="editing && trip !== undefined" :trip @close="() => (editing = false)" />
          <template v-else>
            <FlightLine
              v-if="trip !== undefined && trip.flights.out !== null"
              leg="out"
              :flight="trip.flights.out"
              :on="trip.days[0]?.date"
            />
            <FlightLine
              v-if="trip !== undefined && trip.flights.back !== null"
              leg="back"
              :flight="trip.flights.back"
              :on="trip.days.at(-1)?.date"
            />
            <StayLine
              v-for="s in trip?.stays"
              :key="`${s.checkIn.toString()} ${s.name}`"
              :label="i18n.t('stay.title')"
              :stay="s"
            />
            <CtButton @click="() => (editing = true)">{{ i18n.t("trip.edit") }}</CtButton>
          </template>
        </div>

        <!-- the days side by side, each a stack of its notes in their own paper; maybes faded.
           Wide, each slip is long enough to carry its title -->
        <CtPanel v-if="trip !== undefined && trip.days.length > 0" as="ol" class="days" pad="lg">
          <li
            v-for="d in trip?.days"
            :key="d.date.toString()"
            :aria-label="i18n.t('home.day', { date: short(d.date), count: forDay(d.date).length })"
          >
            <div aria-hidden="true">
              <span
                v-for="n in forDay(d.date)"
                :key="n.id"
                :class="{ maybe: n.schedule.status === 'idea' }"
                :style="`background: ${paperFor(n)}`"
              >{{ n.title }}</span>
            </div>
            <time aria-hidden="true" :datetime="d.date.toString()">{{ short(d.date) }}<small>{{
                weekday(d.date, i18n.locale)
              }}</small></time>
          </li>
        </CtPanel>

        <!-- how far the plan has come: one bar, three piles -->
        <CtShareBar
          :parts="[
            { key: 'fixed', label: i18n.t('home.fixed'), count: piles.fixed, tone: 'full' },
            { key: 'maybe', label: i18n.t('home.maybe'), count: piles.maybe, tone: 'half' },
            { key: 'loose', label: i18n.t('home.loose'), count: piles.loose, tone: 'faint' },
          ]"
        />

        <CtAmount
          :aside="
            allTotal > fixedTotal ? i18n.t('shiori.withMaybes', { total: price(allTotal) }) : undefined
          "
          class="budget"
          :label="i18n.t('home.budget')"
          size="lg"
          :value="price(fixedTotal)"
        />
      </div>

      <div class="side">
        <CtPanel class="todo-card" from="desktop" pad="lg">
          <Todos @add="addTodo" @open="openNote" />
        </CtPanel>

        <People @out="toTrips" />
      </div>
    </div>
  </section>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

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

    /* a phone: the two columns are one, in this order; before the trip, its to-dos come first */
    > .main,
    > .side {
      display: contents;
    }

    .plan {
      order: 2;
    }

    .days {
      order: 3;
    }

    figure {
      order: 4;
    }

    .budget {
      order: 5;
    }

    .todo-card {
      order: 6;
    }

    .people {
      order: 7;
    }

    &.ahead .todo-card {
      order: 1;
    }

    /* the flights, one ticket strip each, and the way into the trip's settings under them */
    .main > .plan {
      display: grid;
      gap: 8px;

      > button {
        justify-self: start;
      }
    }

    > header {
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

          > span:last-child {
            font-size: var(--font-xs);
            color: var(--muted);
          }
        }
      }
    }

    /* one column per day, its notes stacked from the bottom like paper on a spike */
    .main > .days {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      gap: 8px;

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

          /* a slip too short for its title, which is there for a wider screen */
          > span {
            width: min(44px, 100%);
            height: 14px;
            overflow: hidden;
            font-size: 0;
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

      /*
       * Wider than a phone, the days wrap into rows of columns wide enough for a slip to carry
       * its title, read from the top in the day's order and still stacked down onto the spike
       */
      @media (--wide) {
        grid-auto-flow: row;
        grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
        gap: 20px 10px;
        padding: 20px 16px 16px;

        > li > div {
          min-height: 144px;
          flex-direction: column;
          justify-content: flex-end;
          gap: 4px;

          > span {
            width: 100%;
            height: auto;
            box-sizing: border-box;
            padding: 4px 6px;
            font-size: var(--font-xs);
            font-weight: 700;
            line-height: 1.3;
            color: var(--paper-ink);
            white-space: nowrap;
            text-overflow: ellipsis;
          }
        }
      }
    }

    /*
     * A computer: a dashboard as wide as 1200px. The main column has the days large enough to
     * read their slips, the progress and budget side by side, then the flights and stays; to its
     * end, the to-dos on a panel of their own, then the people.
     */
    @media (--desktop) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
      align-content: start;
      align-items: start;
      gap: 36px 40px;
      padding-inline: max(32px, (100% - 1200px) / 2);

      > header {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
        column-gap: 24px;

        > h1,
        > p {
          grid-column: 1;
        }

        > ul {
          grid-column: 2;
          grid-row: 1 / span 2;
          margin: 0;
        }
      }

      > .main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
        gap: 28px 40px;

        > .days {
          order: 0;
          grid-column: 1 / -1;

          > li > div {
            min-height: 184px;
          }
        }

        > figure {
          order: 1;
        }

        > .budget {
          order: 2;
          text-align: end;
        }

        > .plan {
          order: 3;
          grid-column: 1 / -1;
        }
      }

      > .side {
        display: flex;
        flex-direction: column;
        gap: 36px;

        > .todo-card {
          order: 0;
        }

        > .people {
          order: 1;
        }
      }
    }
  }
}
</style>
