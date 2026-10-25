<script lang="ts">
import type { Temporal } from "temporal-polyfill-lite";

import { shallowRef } from "vue";

import { defineQuery } from "@pinia/colada";

import { useNotes } from "../notes/useNotes";
import { draftUpdates } from "../trip/itinerary";
import { useTrip } from "../trip/useTrip";
import type { DayDraft, OverBudget } from "../worker/types";
import { useWorkerCalls } from "../worker/useWorkerCalls";

/**
 * A member's draft of a day: none, asked for, come, or why it did not; every kind but none is
 * about one day (`date`)
 */
type DraftState =
  | { kind: "idle" }
  | { kind: "asking"; date: Temporal.PlainDate }
  | { kind: "drafted"; date: Temporal.PlainDate; draft: DayDraft }
  | { kind: "failed"; date: Temporal.PlainDate; why: "failed" | OverBudget["ceiling"] };

/**
 * The booklet's draft of a day, one at a time, kept while the booklet is read rather than
 * written. Asking is a paid call: a failure, thrown or the budget's refusal, is said by the
 * button, and asking again is the person's tap, never a retry. Defined once for the app
 * (defineQuery).
 */
const useDayDraft = defineQuery(() => {
  const calls = useWorkerCalls();
  const store = useNotes();
  const { forDay, dayOf, setIntro } = useTrip();
  const state = shallowRef<DraftState>({ kind: "idle" });

  async function ask(date: Temporal.PlainDate) {
    if (state.value.kind === "asking") return;
    state.value = { kind: "asking", date };
    try {
      const answer = await calls.draftDay.mutateAsync({ date, notes: forDay(date) });
      state.value = answer.ok
        ? { kind: "drafted", date, draft: answer.value }
        : { kind: "failed", date, why: answer.reason.ceiling };
    } catch {
      state.value = { kind: "failed", date, why: "failed" };
    }
  }
  /** The draft becomes the day: its order and times on the memos, its intro unless one is written */
  function adopt() {
    const s = state.value;
    if (s.kind !== "drafted") return;
    // the day's memos as they are now, not as they were when the draft was asked for
    for (const { id, patch } of draftUpdates(s.draft, forDay(s.date))) store.update(id, patch);
    // keep an intro someone already wrote
    const written = dayOf(s.date)?.intro ?? "";
    setIntro(s.date, written === "" ? s.draft.intro : written);
    state.value = { kind: "idle" };
  }
  function dismiss() {
    state.value = { kind: "idle" };
  }

  return { state, ask, adopt, dismiss };
});
</script>

<script setup lang="ts" vapor>
import { computed } from "vue";

import {
  CtButton,
  CtChip,
  CtHint,
  CtInput,
  CtMessage,
  CtPaper,
  CtSelect,
  CtTextarea,
} from "../../../ui/index";

import { formatMoney } from "../../shared/money";

import { useI18n } from "../../i18n/useI18n";

import { useMembers } from "../members/useMembers";
import type { Scheduled } from "../notes/types";
import { useOffline } from "../sync/useOffline";
import { durationChoices, durationMessage, fromHhmm, hhmm } from "../trip/format";
import { assignTo, cycleStatus } from "../trip/itinerary";
import { useWorker } from "../worker/useWorker";

import Day from "./Day.vue";

/**
 * A day of the booklet as it is written: its line, each plan's time, how long it takes and how
 * sure it is, the maybes in place on the strip, and a member's draft of the day to take or
 * leave. Lateness of a booking is counted from `today`.
 */
const props = defineProps<{ day: Temporal.PlainDate; today: Temporal.PlainDate }>();
const store = useNotes();
const { trip, forDay, dayOf, setIntro } = useTrip();
const { members } = useMembers();
const worker = useWorker();
const i18n = useI18n();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
const { state: draft, ask, adopt, dismiss } = useDayDraft();

/** Every plan of the day, the maybes in their place */
const notes = computed(() => forDay(props.day));
/** The draft as this day has it: one asked for, come or failed for another day is none here */
const here = computed((): DraftState => {
  const s = draft.value;
  return s.kind !== "idle" && s.date.equals(props.day) ? s : { kind: "idle" };
});
/** Who drafted it; nobody once they have left the room */
const drafter = computed(() => {
  const h = here.value;
  if (h.kind !== "drafted") return undefined;
  return members.value?.find((m) => m.id === h.draft.by);
});
/** Why the draft did not come: it failed, or the budget is spent (asking again will not help) */
const FAILED = {
  failed: "shiori.draftFailed",
  day: "shiori.draftLimit",
  trip: "shiori.draftTripLimit",
} as const satisfies Record<Extract<DraftState, { kind: "failed" }>["why"], string>;

const price = (amount: number) =>
  trip.value === undefined ? "" : formatMoney(amount, trip.value.currency, i18n.locale);
/** "1 h 30 min" */
function long(minutes: number) {
  const d = durationMessage(minutes);
  return i18n.t(d.id, d.params);
}
function onIntroChange(e: Event) {
  if (e.target instanceof HTMLTextAreaElement) setIntro(props.day, e.target.value);
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
function nextStatus(n: Scheduled) {
  store.update(n.id, { schedule: cycleStatus(n.schedule) });
}
/** Booked, from the strip: the number and page can be written in the note later */
function markBooked(n: Scheduled) {
  store.update(n.id, { booking: { state: "booked", code: "", url: null } });
}
</script>

<template>
  <Day :day :today :notes>
    <template #intro>
      <!-- written when it is left (change), not as each letter goes in -->
      <CtTextarea
        class="intro"
        dashed
        data-turn
        rows="2"
        :aria-label="i18n.t('shiori.intro')"
        :placeholder="i18n.t('shiori.introPlaceholder')"
        :model-value="dayOf(day)?.intro ?? ''"
        @change="onIntroChange"
      />
    </template>
    <template #tab="{ n }">
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
    <template #booking="{ n }">
      <CtButton v-if="n.booking?.state === 'needed'" variant="text" @click="() => markBooked(n)">{{
        i18n.t("shiori.markBooked")
      }}</CtButton>
    </template>
    <template #tail="{ n }">
      <div class="edit">
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
          @click="() => store.update(n.id, assignTo(n, null))"
        >{{ i18n.t("shiori.removeDay") }}</CtButton>
      </div>
    </template>
    <template #after>
      <!-- a member's draft of the day -->
      <template v-if="worker.api !== null && notes.length > 0">
        <CtPaper v-if="here.kind === 'drafted'" class="draft" data-turn variant="proposal" wide>
          <template #strip
          >{{ i18n.t("shiori.draft") }} · {{ drafter?.name ?? i18n.t("member.someone") }}</template>
          <template #default>
            <p>{{ here.draft.reason }}</p>
            <ol><li v-for="it in here.draft.items" :key="it.note.id">{{
                  it.time ? `${hhmm(it.time)} ` : ""
                }}{{ it.note.title }}<small v-if="it.minutes !== null">{{
                  ` · ${long(it.minutes)}`
                }}</small></li></ol>
          </template>
          <template #foot>
            <CtButton variant="primary" @click="adopt">{{ i18n.t("shiori.adoptDraft") }}</CtButton>
            <CtButton @click="dismiss">{{ i18n.t("common.dismiss") }}</CtButton>
          </template>
        </CtPaper>
        <template v-else>
          <!-- an ask for any day holds the button: one draft is asked for at a time -->
          <CtButton
            class="ask-draft"
            data-turn
            variant="ask"
            :disabled="draft.kind === 'asking' || cut.offline"
            :busy="here.kind === 'asking'"
            @click="() => ask(day)"
          >{{ i18n.t(here.kind === "asking" ? "shiori.drafting" : "shiori.askDraft") }}</CtButton>
          <CtHint v-if="cut.offline" data-turn>{{ i18n.t("offline.unavailable") }}</CtHint>
          <CtMessage v-if="here.kind === 'failed'" aria-live="polite" class="failed" danger>{{
            i18n.t(FAILED[here.why])
          }}</CtMessage>
        </template>
      </template>
    </template>
  </Day>
</template>

<style scoped>
.intro {
  margin-block-end: 10px;
}

/* the status, the price, taking it off the day */
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

/* the agent's slip (CtPaper proposal), as on the canvas: why, then the day it would make */
.draft {
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

.ask-draft {
  margin-block-start: 14px;
}

/* the ask that did not go through; trying again is the button's own tap */
.failed {
  margin: 8px 0 0;
}
</style>
