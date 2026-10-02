<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, ref } from "vue";

import { CtSegmented, CtTabList, CtTabPanel, type CtOption } from "../../ui/index";

import { formatMoney } from "../shared/money";

import Message from "../i18n/Message.vue";
import { useI18n } from "../i18n/useI18n";

import { useMembers } from "../features/members/useMembers";
import { ARRIVAL_TAG, PACKING_TAG, type Memo, type Scheduled } from "../features/notes/types";
import { useNotes } from "../features/notes/useNotes";
import { safeUrl } from "../features/place/google-maps";
import { useTags } from "../features/tags/useTags";
import { fromHhmm, hhmm, longDate, shortDate } from "../features/trip/format";
import { assignTo, cycleStatus, draftUpdates } from "../features/trip/itinerary";
import { useTrip } from "../features/trip/useTrip";
import type { DayDraft } from "../features/worker/types";
import { useWorker } from "../features/worker/useWorker";

type Draft = DayDraft & { date: Temporal.PlainDate };

const store = useNotes();
const tags = useTags();
const trip = useTrip();
const worker = useWorker();
const members = useMembers();
const i18n = useI18n();
/** A picked day, the appendix, or null for "the first day" */
const tab = ref<Temporal.PlainDate | "appendix" | null>(null);
/** The open day, or null on the appendix tab (or while the trip has no days) */
const day = computed(() =>
  tab.value === "appendix" ? null : (tab.value ?? trip.days[0]?.date ?? null),
);
const price = (amount: number) => formatMoney(amount, trip.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);

// tabs are keyed by the date's ISO string
const APPENDIX = "appendix";
const dayTabs = computed<CtOption[]>(() => [
  ...trip.days.map((d) => ({ value: d.date.toString(), label: short(d.date) })),
  { value: APPENDIX, label: i18n.t("shiori.appendix") },
]);
const activeTab = computed(() => day.value?.toString() ?? APPENDIX);
function showTab(value: string) {
  tab.value = value === APPENDIX ? "appendix" : Temporal.PlainDate.from(value);
}

type Mode = "edit" | "read";
const modes = computed((): CtOption<Mode>[] => [
  { value: "edit", label: i18n.t("common.edit") },
  { value: "read", label: i18n.t("shiori.read") },
]);
const mode = ref<Mode>("edit");
const editing = computed(() => mode.value === "edit");
const picking = ref<Memo | null>(null); // note being assigned from the tray
const draft = ref<Draft | null>(null); // a member's draft of the open day

const APPENDIX_TAGS = [PACKING_TAG, ARRIVAL_TAG];

const totalFixed = computed(() => trip.budgetOf(undefined, true));
const totalAll = computed(() => trip.budgetOf(undefined, false));

function assign(n: Memo, date: Temporal.PlainDate | null) {
  store.update(n.id, assignTo(n, date));
  picking.value = null;
  if (date) tab.value = date;
}
function togglePick(n: Memo) {
  picking.value = picking.value?.id === n.id ? null : n;
}
/** The tray's pick row: the picked memo goes on this day */
function putPickedOn(date: Temporal.PlainDate) {
  if (picking.value) assign(picking.value, date);
}
function nextStatus(n: Scheduled) {
  store.update(n.id, { schedule: cycleStatus(n.schedule) });
}
function setTime(n: Scheduled, e: Event) {
  const time = fromHhmm((e.target as HTMLInputElement).value);
  store.update(n.id, { schedule: { ...n.schedule, time } });
}
function setIntro(e: Event) {
  if (!day.value) return;
  trip.setIntro(day.value, (e.target as HTMLTextAreaElement).value);
}

async function askForDraft() {
  const date = day.value;
  if (!date || !worker.api) return;
  draft.value = { date, ...(await worker.api.draftDay(date, trip.forDay(date))) };
}
function exportBooklet() {
  void worker.api?.exportBooklet();
}

function adoptDraft() {
  if (!draft.value) return;
  for (const { id, patch } of draftUpdates(draft.value)) store.update(id, patch);
  // keep an intro someone already wrote
  trip.setIntro(draft.value.date, trip.dayOf(draft.value.date)?.intro || draft.value.intro);
  draft.value = null;
}
</script>

<template>
  <div class="shiori">
    <header class="head">
      <h1>{{ i18n.t("nav.booklet") }}</h1>
      <p class="sum"><template v-if="trip.days.length">{{ short(trip.days[0]!.date) }} – {{ short(trip.days.at(-1)!.date) }} · </template>{{ i18n.t("shiori.summary", { fixed: trip.fixedCount, total: price(totalFixed) }) }}<small v-if="totalAll > totalFixed">{{ i18n.t("shiori.withMaybes", { total: price(totalAll) }) }}</small></p>
      <CtSegmented v-model="mode" class="mode" :label="i18n.t('shiori.mode')" :options="modes" />
    </header>

    <!-- tray: memos without a day (edit mode only) -->
    <section v-if="editing" class="tray">
      <div class="tray-head"><span>{{ i18n.t("shiori.trayTitle", { count: trip.unassigned.length }) }}</span><span class="muted">{{ i18n.t("shiori.trayHint") }}</span></div>
      <div v-if="trip.unassigned.length === 0" class="muted empty">{{ i18n.t("shiori.trayEmpty") }}</div>
      <div v-else class="tray-row">
        <button
          v-for="n in trip.unassigned"
          :key="n.id"
          class="tray-card"
          type="button"
          :class="{ picking: picking?.id === n.id }"
          :style="`background:${n.color}`"
          @click="() => togglePick(n)"
        >
          <span class="t">{{ n.title }}</span>
          <span class="tags"><span v-for="t in n.tags" :key="t" :style="`--tag:${tags.tagColor(t)}`">#{{ t }}</span></span>
        </button>
      </div>
      <div v-if="picking" class="pick">
        <span class="pick-label">{{ i18n.t("shiori.putOn", { title: picking.title }) }}</span>
        <button
          v-for="d in trip.days"
          :key="d.date.toString()"
          type="button"
          @click="() => putPickedOn(d.date)"
        >{{ short(d.date) }}</button>
        <button class="later" type="button" @click="() => (picking = null)">{{ i18n.t("shiori.later") }}</button>
      </div>
    </section>

    <CtTabList
      class="tabs"
      :label="i18n.t('shiori.days')"
      :tabs="dayTabs"
      :model-value="activeTab"
      @update:model-value="showTab"
    />

    <main class="body">
      <!-- the page morphs when the day or the mode changes -->
      <CtTabPanel :value="`${activeTab}:${mode}`">
        <!-- ---------- a day ---------- -->
        <template v-if="day">
          <h2 class="day">
            <Message
              id="shiori.dayHeading"
              :params="{ n: trip.dayNumber(day), date: longDate(day, i18n.locale) }"
            >
              <template #date="{ text }"><span>{{ text }}</span></template>
            </Message>
          </h2>

          <template v-if="editing">
            <textarea
              class="intro"
              rows="2"
              :aria-label="i18n.t('shiori.intro')"
              :placeholder="i18n.t('shiori.introPlaceholder')"
              :value="trip.dayOf(day)?.intro"
              @change="setIntro"
            ></textarea>
          </template>
          <p v-else-if="trip.dayOf(day)?.intro" class="intro-read">{{ trip.dayOf(day)?.intro }}</p>

          <p v-if="trip.forDay(day).length === 0" class="muted empty">{{ i18n.t("shiori.dayEmpty") }}</p>

          <ol class="items">
            <li v-for="n in trip.forDay(day)" :key="n.id" class="item" :class="n.schedule.status">
              <template v-if="editing">
                <input
                  class="time"
                  type="time"
                  :aria-label="i18n.t('shiori.time')"
                  :value="n.schedule.time ? hhmm(n.schedule.time) : ''"
                  @change="(e: Event) => setTime(n, e)"
                />
                <div class="main">
                  <p class="t">{{ n.title }}</p>
                  <p v-if="n.body" class="b">{{ n.body }}</p>
                  <div class="row">
                    <button
                      class="status"
                      type="button"
                      :class="n.schedule.status"
                      @click="() => nextStatus(n)"
                    >{{ i18n.t(`status.${n.schedule.status}`) }}</button>
                    <span v-if="n.budget" class="muted">{{ price(n.budget) }}</span>
                    <button class="unassign" type="button" @click="() => assign(n, null)">{{ i18n.t("shiori.removeDay") }}</button>
                  </div>
                </div>
              </template>
              <template v-else-if="n.schedule.status !== 'idea'">
                <span class="time-read">{{ n.schedule.time ? hhmm(n.schedule.time) : i18n.t("shiori.anytime") }}</span>
                <div class="main">
                  <p class="t">{{ n.title }}</p>
                  <p class="meta"><span v-if="n.body">{{ n.body }}</span><span v-if="n.budget"> · {{ price(n.budget) }}</span><a
                      v-if="safeUrl(n.mapsUrl)"
                      :href="safeUrl(n.mapsUrl)"
                      rel="noopener noreferrer"
                      target="_blank"
                    > · {{ i18n.t("shiori.mapLink") }}</a></p>
                </div>
              </template>
            </li>
          </ol>

          <!-- read mode: candidates at the end of the day -->
          <template v-if="!editing && trip.forDay(day, 'idea').length">
            <h3 class="maybe">{{ i18n.t("shiori.ifTime") }}</h3>
            <ul class="maybe-list"><li v-for="n in trip.forDay(day, 'idea')" :key="n.id">{{ n.title }}<span v-if="n.budget" class="muted"> · {{ price(n.budget) }}</span></li></ul>
          </template>

          <!-- a member's draft of the day (edit mode) -->
          <template v-if="editing && worker.api && trip.forDay(day).length">
            <div
              v-if="draft && draft.date.equals(day)"
              class="draft"
              :style="`--who: ${members.colorOf(draft.by)}`"
            >
              <div class="h"><span aria-hidden="true" class="dot"></span>{{ members.nameOf(draft.by) }}<small>{{ i18n.t("shiori.draft") }}</small></div>
              <p>{{ draft.reason }}</p>
              <ol><li v-for="it in draft.items" :key="it.note.id">{{ it.time ? `${hhmm(it.time)} ` : "" }}{{ it.note.title }}</li></ol>
              <div class="act"><button class="ok" type="button" @click="adoptDraft">{{ i18n.t("shiori.adoptDraft") }}</button><button class="no" type="button" @click="() => (draft = null)">{{ i18n.t("common.dismiss") }}</button></div>
            </div>
            <button v-else class="ask" type="button" @click="askForDraft">{{ i18n.t("shiori.askDraft") }}</button>
          </template>

          <p v-if="trip.budgetOf(day)" class="daytotal">{{ i18n.t("shiori.dayTotal", { total: price(trip.budgetOf(day)) }) }}<small v-if="trip.budgetOf(day, false) > trip.budgetOf(day)">{{ i18n.t("shiori.withMaybes", { total: price(trip.budgetOf(day, false)) }) }}</small></p>
        </template>

        <!-- ---------- appendix ---------- -->
        <template v-else>
          <section v-for="t in APPENDIX_TAGS" :key="t" class="appendix">
            <h2 class="day tagged" :style="`--tag:${tags.tagColor(t)}`">#{{ t }}</h2>
            <ul class="check"><li v-for="n in trip.byTag(t)" :key="n.id"><label><input type="checkbox" />{{ n.title }}<span v-if="n.body" class="muted"> — {{ n.body }}</span></label></li></ul>
            <p v-if="trip.byTag(t).length === 0" class="muted">{{ i18n.t("shiori.tagEmpty") }}</p>
          </section>
        </template>
      </CtTabPanel>
    </main>

    <footer v-if="!editing && worker.api" class="foot">
      <button class="export" type="button" @click="exportBooklet">{{ i18n.t("shiori.export") }}</button>
    </footer>
  </div>
</template>

<style scoped>
.shiori {
  position: absolute;
  inset: 0;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.head {
  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 8px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  align-items: center;
}

h1 {
  margin: 0;
  font-size: var(--font-4xl);
  font-weight: 900;
  color: var(--accent-text);
}

.sum {
  margin: 0;
  grid-column: 1 / -1;
  font-size: var(--font-sm);
  color: var(--muted);
  small {
    font-size: var(--font-xs);
  }
}

.mode {
  /* next to the title; .sum comes first in the markup and takes the row below */
  grid-row: 1;
  grid-column: 2;
}

.muted {
  color: var(--muted);
  font-size: var(--font-sm);
}

.empty {
  padding: 14px 0;
}

.tray {
  padding: 6px 16px 10px;
  border-bottom: 1.5px solid var(--line);
  background: color-mix(in srgb, var(--surface) 60%, var(--bg));
}

.tray-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-sm);
  font-weight: 700;
  margin-block-end: 6px;
}

.tray-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 0 6px;
  &::-webkit-scrollbar {
    display: none;
  }
}

.tray-card {
  flex-shrink: 0;
  width: 140px;
  text-align: start;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--paper-ink);
  box-shadow: var(--shadow-paper);
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 2px solid transparent;
  &.picking {
    border-color: var(--ink);
  }
  .t {
    font-size: var(--font-sm);
    font-weight: 700;
    line-height: 1.35;
  }
  .tags {
    font-size: var(--font-xs);
    font-weight: 700;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    span {
      color: color-mix(in oklch, var(--tag) var(--tint-paper-mix), var(--paper-ink));
    }
  }
}

.pick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding-block-start: 6px;
  button {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--bg);
    font-size: var(--font-sm);
    font-weight: 700;
  }
  .later {
    background: transparent;
    color: var(--muted);
    border: 1.5px solid var(--line);
  }
}

.pick-label {
  font-size: var(--font-sm);
  font-weight: 700;
  margin-inline-end: 4px;
}

.tabs {
  flex-shrink: 0;
  margin: 4px 16px 0;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 24px;
}

.day {
  margin: 8px 0 10px;
  font-size: var(--font-2xl);
  font-weight: 900;
  &.tagged {
    color: color-mix(in oklch, var(--tag) var(--tint-mix), var(--tint-base));
  }
  span {
    font-size: var(--font-md);
    font-weight: 700;
    color: var(--muted);
    margin-inline-start: 8px;
  }
}

.intro {
  width: 100%;
  font: inherit;
  font-size: var(--font-md);
  padding: 10px 12px;
  border: 1.5px dashed var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  resize: none;
  margin-block-end: 10px;
}

.intro-read {
  margin: 0 0 12px;
  font-size: var(--font-base);
  line-height: 1.7;
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 14px;
  &.fixed {
    border-color: var(--gold);
  }
  &.done {
    opacity: .5;
  }
  .main {
    flex: 1;
    min-width: 0;
  }
  .t {
    margin: 0;
    font-size: var(--font-base);
    font-weight: 700;
    line-height: 1.4;
  }
  .b,
  .meta {
    margin: 2px 0 0;
    font-size: var(--font-sm);
    color: var(--muted);
  }
  .meta a {
    /* a text link, but a thumb-sized one */
    display: inline-block;
    padding: 8px 6px;
    margin: -8px -6px;
    color: var(--link);
    font-weight: 700;
    text-decoration: none;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-block-start: 6px;
  }
}

.time {
  width: 86px;
  min-height: var(--tap);
  flex-shrink: 0;
  font: inherit;
  font-size: var(--font-md);
  font-weight: 700;
  padding: 4px 6px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  color: var(--ink);
  align-self: flex-start;
}

.time-read {
  width: 56px;
  flex-shrink: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: var(--font-md);
  padding-block-start: 1px;
}

.status {
  min-height: var(--tap);
  padding: 0 12px;
  border-radius: 999px;
  font-size: var(--font-xs);
  font-weight: 700;
  background: var(--line);
  border: 1.5px solid transparent;
  /* confirmed and done are a tinted pill with an edge and ink-mixed text, not white on gold */
  &.fixed {
    background: color-mix(in srgb, var(--gold) 18%, var(--surface));
    border-color: var(--gold);
    /* gold is a light hue: it needs more ink than the other tints to read as text */
    color: color-mix(in oklch, var(--gold) calc(var(--tint-mix) - 28%), var(--tint-base));
  }
  &.done {
    background: color-mix(in srgb, var(--jade) 18%, var(--surface));
    border-color: var(--jade);
    color: color-mix(in oklch, var(--jade) var(--tint-mix), var(--tint-base));
  }
}

.unassign {
  margin-inline-start: auto;
  min-height: var(--tap);
  padding: 0 8px;
  font-size: var(--font-xs);
  color: var(--muted);
}

.maybe {
  margin: 18px 0 6px;
  font-size: var(--font-md);
  color: var(--muted);
}

.maybe-list {
  margin: 0;
  padding-inline-start: 18px;
  font-size: var(--font-md);
  color: var(--muted);
}

.daytotal {
  margin: 16px 0 0;
  text-align: end;
  font-size: var(--font-md);
  font-weight: 700;
  small {
    font-weight: 400;
    color: var(--muted);
  }
}

.ask {
  margin-block-start: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--ivory);
  border: 1px solid var(--oat);
  color: var(--slate);
  font-size: var(--font-sm);
}

.draft {
  margin-block-start: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--ivory);
  border: 1px solid var(--oat);
  color: var(--slate);
  .h {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-base);
    font-weight: 700;
    margin-block-end: 4px;
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--who);
    }
    small {
      margin-inline-start: auto;
      font-size: var(--font-2xs);
      font-weight: 400;
      color: var(--stone);
    }
  }
  p {
    margin: 0 0 6px;
    font-size: var(--font-md);
    line-height: 1.5;
  }
  ol {
    margin: 0 0 8px;
    padding-inline-start: 20px;
    font-size: var(--font-md);
  }
  .act {
    display: flex;
    gap: 6px;
    button {
      min-height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      font-size: var(--font-sm);
      font-weight: 600;
    }
    .ok {
      background: color-mix(in oklch, var(--who) 70%, #1c2238);
      color: var(--on-accent);
    }
    .no {
      border: .5px solid rgba(31,30,29,.3);
    }
  }
}

.appendix {
  & + .appendix {
    margin-block-start: 18px;
  }
}

.check {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  label {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 10px 12px;
    background: var(--surface);
    border: 1.5px solid var(--line);
    border-radius: 12px;
    font-size: var(--font-base);
  }
  input {
    width: 20px;
    height: 20px;
    accent-color: var(--jade);
  }
}

.foot {
  padding: 10px 16px 12px;
  border-top: 1.5px solid var(--line);
  background: var(--bg);
}

.export {
  width: 100%;
  height: 48px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-size: var(--font-base);
  font-weight: 700;
}
</style>
