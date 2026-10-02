<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, ref } from "vue";

import { CtAppBar, CtSegmented, CtTabList, CtTabPanel, type CtOption } from "../../ui/index";

import { formatMoney } from "../shared/money";

import Message from "../i18n/Message.vue";
import { useI18n } from "../i18n/useI18n";

import { useMembers } from "../features/members/useMembers";
import {
  ARRIVAL_TAG,
  PACKING_TAG,
  PAPERS,
  type Memo,
  type Scheduled,
} from "../features/notes/types";
import { useNotes } from "../features/notes/useNotes";
import { safeUrl } from "../features/place/google-maps";
import { fromHhmm, hhmm, longDate, shortDate } from "../features/trip/format";
import { assignTo, cycleStatus, draftUpdates } from "../features/trip/itinerary";
import { useTrip } from "../features/trip/useTrip";
import type { DayDraft } from "../features/worker/types";
import { useWorker } from "../features/worker/useWorker";

type Draft = DayDraft & { date: Temporal.PlainDate };

const store = useNotes();
const trip = useTrip();
const worker = useWorker();
const members = useMembers();
const i18n = useI18n();
/** A picked day, the appendix, or null for "today if the trip is on, else the first day" */
const tab = ref<Temporal.PlainDate | "appendix" | null>(null);
const today = Temporal.Now.plainDateISO();
const openingDay = computed(
  () => trip.days.find((d) => d.date.equals(today))?.date ?? trip.days[0]?.date ?? null,
);
/** The open day, or null on the appendix tab (or while the trip has no days) */
const day = computed(() => (tab.value === "appendix" ? null : (tab.value ?? openingDay.value)));
const price = (amount: number) => formatMoney(amount, trip.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);

// tabs are keyed by the date's ISO string
const APPENDIX = "appendix";
const dayTabs = computed<CtOption[]>(() => [
  ...trip.days.map((d) => ({
    value: d.date.toString(),
    label: i18n.t("shiori.dayTab", { n: trip.dayNumber(d.date), date: short(d.date) }),
  })),
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
/** A tick in the appendix: shared with the room, so the partner sees the bag is packed */
function setChecked(n: Memo, e: Event) {
  store.update(n.id, { checked: (e.target as HTMLInputElement).checked });
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
    <CtAppBar>
      <!-- explicit: Vapor drops implicit default-slot content that sits beside a named slot -->
      <template #default>
        <CtTabList
          class="tabs"
          :label="i18n.t('shiori.days')"
          :tabs="dayTabs"
          :model-value="activeTab"
          @update:model-value="showTab"
        />
      </template>
      <template #end>
        <CtSegmented v-model="mode" :label="i18n.t('shiori.mode')" :options="modes" />
      </template>
    </CtAppBar>

    <main class="body">
      <p class="sum"><template v-if="trip.days.length">{{ short(trip.days[0]!.date) }} – {{ short(trip.days.at(-1)!.date) }} · </template>{{ i18n.t("shiori.summary", { fixed: trip.fixedCount, total: price(totalFixed) }) }}<small v-if="totalAll > totalFixed">{{ i18n.t("shiori.withMaybes", { total: price(totalAll) }) }}</small></p>

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
            :aria-pressed="picking?.id === n.id"
            :style="`background:${PAPERS[n.color]}`"
            @click="() => togglePick(n)"
          >
            <span class="t">{{ n.title }}</span>
            <span class="tags"><span v-for="t in n.tags" :key="t">#{{ t }}</span></span>
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

          <!-- the day is a strip of the same stickies as the canvas, pinned in time order -->
          <ol class="strip">
            <li
              v-for="n in editing ? trip.forDay(day) : trip.forDay(day).filter((m) => m.schedule.status !== 'idea')"
              :key="n.id"
              class="paper"
              :class="n.schedule.status"
              :style="`--card:${PAPERS[n.color]}`"
              :data-stamp="i18n.t('status.done')"
            >
              <div class="tab">
                <input
                  v-if="editing"
                  class="time"
                  type="time"
                  :aria-label="i18n.t('shiori.time')"
                  :value="n.schedule.time ? hhmm(n.schedule.time) : ''"
                  @change="(e) => setTime(n, e)"
                />
                <span v-else class="time-read">{{ n.schedule.time ? hhmm(n.schedule.time) : i18n.t("shiori.anytime") }}</span>
              </div>
              <div class="main">
                <p class="t">{{ n.title }}</p>
                <p v-if="n.body" class="b">{{ n.body }}</p>
                <div v-if="editing" class="row">
                  <button
                    class="status"
                    type="button"
                    :class="n.schedule.status"
                    @click="() => nextStatus(n)"
                  >{{ i18n.t(`status.${n.schedule.status}`) }}</button>
                  <span v-if="n.budget" class="muted">{{ price(n.budget) }}</span>
                  <button class="unassign" type="button" @click="() => assign(n, null)">{{ i18n.t("shiori.removeDay") }}</button>
                </div>
                <p v-else class="meta"><span v-if="n.budget">{{ price(n.budget) }}</span><a
                    v-if="safeUrl(n.mapsUrl)"
                    :href="safeUrl(n.mapsUrl)"
                    rel="noopener noreferrer"
                    target="_blank"
                  >{{ i18n.t("shiori.mapLink") }}</a></p>
              </div>
            </li>
          </ol>

          <!-- read mode: the maybes, faded, at the end of the strip -->
          <template v-if="!editing && trip.forDay(day, 'idea').length">
            <h3 class="maybe">{{ i18n.t("shiori.ifTime") }}</h3>
            <ol class="strip maybes">
              <li
                v-for="n in trip.forDay(day, 'idea')"
                :key="n.id"
                class="paper idea"
                :style="`--card:${PAPERS[n.color]}`"
              >
                <div class="tab"><span class="time-read">{{ n.schedule.time ? hhmm(n.schedule.time) : i18n.t("shiori.anytime") }}</span></div>
                <div class="main">
                  <p class="t">{{ n.title }}</p>
                  <p v-if="n.budget" class="meta"><span>{{ price(n.budget) }}</span></p>
                </div>
              </li>
            </ol>
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
            <h2 class="day">#{{ t }}</h2>
            <ul class="check"><li
                v-for="n in trip.byTag(t)"
                :key="n.id"
                :class="{ checked: n.checked }"
                :style="`--card:${PAPERS[n.color]}`"
              ><label><input type="checkbox" :checked="n.checked" @change="(e) => setChecked(n, e)" /><span class="t">{{ n.title }}</span><span v-if="n.body" class="muted"> — {{ n.body }}</span></label></li></ul>
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

.sum {
  margin: 12px 0 0;
  font-size: var(--font-sm);
  color: var(--muted);
  & small {
    font-size: var(--font-xs);
  }
}

.muted {
  color: var(--muted);
  font-size: var(--font-sm);
}

.empty {
  padding: 14px 0;
}

/* the notes still without a day, on a tool panel above the page */
.tray {
  margin-block: 12px 4px;
  padding: 10px 12px 8px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
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
  padding: 4px 24px 8px 2px;
  margin-inline: -2px;
  mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
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
  &.picking {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .t {
    font-size: var(--font-sm);
    font-weight: 700;
    line-height: 1.35;
  }
  .tags {
    font-size: var(--font-xs);
    font-weight: 700;
    color: var(--paper-muted);
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
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
    color: var(--on-ink);
    font-size: var(--font-sm);
    font-weight: 700;
  }
  .later {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--line);
  }
}

.pick-label {
  font-size: var(--font-sm);
  font-weight: 700;
  margin-inline-end: 4px;
}

/* the day tabs fill the bar's tools row; the bar's own edge is their baseline */
.tabs {
  flex: 1;
  min-width: 0;
  align-self: stretch;
  padding-inline: 8px 24px;
  border-block-end: 0;
  /* a row that keeps going says so, like the desk's chip row */
  mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
}

/* a booklet is read at a page's width, on a laptop too */
.body {
  flex: 1;
  overflow-y: auto;
  padding: 0 max(16px, calc((100% - 648px) / 2)) 24px;
}

.day {
  margin: 20px 0 10px;
  font-size: var(--font-2xl);
  font-weight: 700;
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
  border: 1px dashed color-mix(in oklch, var(--ink) 25%, var(--line));
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  resize: none;
  margin-block-end: 10px;
}

/* the day's line, written above the strip on the desk's own ruled line */
.intro-read {
  margin: 0 6px 14px;
  padding-block-end: 8px;
  border-block-end: 1px dashed var(--line);
  font-size: var(--font-base);
  line-height: 1.7;
}

/* ---- the strip: stickies pinned in order ---- */
.strip {
  list-style: none;
  margin: 0;
  padding: 4px 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* A sticky, the same paper as on the canvas, with a time tab along its left edge; level, for reading (only the desk tilts) */
.paper {
  position: relative;
  display: flex;
  border-radius: 6px;
  background: var(--card, var(--paper-white));
  color: var(--paper-ink);
  box-shadow: var(--shadow-paper);
  /* done: stamped in the paper's ink, and the title steps back to its quieter ink; nothing goes translucent */
  &.done .t {
    color: var(--paper-muted);
  }
  &.done::after {
    content: attr(data-stamp);
    position: absolute;
    inset-block-start: 6px;
    inset-inline-end: 10px;
    padding: 1px 8px;
    border: 2px solid var(--paper-ink);
    border-radius: 4px;
    color: var(--paper-ink);
    font-size: var(--font-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    transform: rotate(-10deg);
    opacity: 0.7;
    pointer-events: none;
  }
  .tab {
    flex-shrink: 0;
    width: 76px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 10px 6px;
    border-radius: 6px 0 0 6px;
    /* a darker fold of the same paper: lightness only, so a yellow fold stays yellow */
    background: oklch(from var(--card, var(--paper-white)) calc(l - 0.045) c h);
  }
  .main {
    flex: 1;
    min-width: 0;
    padding: 10px 12px 10px 12px;
  }
  .t {
    margin: 0;
    font-size: var(--font-base);
    font-weight: 700;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .b {
    margin: 2px 0 0;
    font-size: var(--font-sm);
    color: var(--paper-muted);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta {
    margin: 4px 0 0;
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: var(--font-sm);
    color: var(--paper-muted);
    a {
      /* a text link, but a thumb-sized one */
      display: inline-flex;
      align-items: center;
      min-height: var(--tap);
      padding: 0 6px;
      margin-inline-start: -6px;
      color: var(--paper-ink);
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-block-start: 6px;
    .muted {
      color: var(--paper-muted);
    }
  }
}

.time {
  width: 100%;
  min-height: var(--tap);
  font: inherit;
  font-size: var(--font-md);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 4px 4px;
  border: 1px solid color-mix(in oklch, var(--paper-ink) 20%, transparent);
  border-radius: 10px;
  background: color-mix(in oklch, var(--paper-white) 55%, transparent);
  color: var(--paper-ink);
  text-align: center;
  /* the field is the tab; the browser's clock glyph would crowd the digits out */
  &::-webkit-calendar-picker-indicator {
    display: none;
  }
}

.time-read {
  padding-block-start: 2px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--paper-ink);
  font-size: var(--font-md);
}

.status {
  min-height: var(--tap);
  padding: 0 12px;
  border-radius: 999px;
  font-size: var(--font-xs);
  font-weight: 700;
  /* three steps in one ink: a dashed maybe, a filled confirmed, an outlined done */
  background: transparent;
  border: 1px dashed color-mix(in oklch, var(--paper-ink) 45%, transparent);
  color: var(--paper-ink);
  &.fixed {
    background: var(--paper-ink);
    border: 1px solid var(--paper-ink);
    color: var(--paper-white);
  }
  &.done {
    border: 1px solid var(--paper-ink);
  }
}

.unassign {
  margin-inline-start: auto;
  min-height: var(--tap);
  padding: 0 8px;
  font-size: var(--font-xs);
  color: var(--paper-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.maybe {
  margin: 18px 6px 6px;
  font-size: var(--font-md);
  color: var(--muted);
}

/* read mode's maybes: the paper fades toward white stock in either theme (Paper Stays Light), the ink stays at full */
.maybes {
  .paper {
    background: color-mix(in oklch, var(--card, var(--paper-white)) 45%, var(--paper-white));
    box-shadow: var(--shadow-tool);
    .tab {
      background: color-mix(in oklch, var(--card, var(--paper-white)) 70%, var(--paper-white));
    }
  }
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
  background: var(--surface);
  border: 1px dashed color-mix(in oklch, var(--ink) 30%, var(--line));
  color: var(--ink);
  font-size: var(--font-sm);
  font-weight: 700;
}

.draft {
  margin-block-start: 14px;
  padding: 12px 14px;
  /* square, white and dashed: the agent's paper, as on the canvas */
  border-radius: 0;
  background: var(--paper-white);
  box-shadow: var(--shadow-paper);
  outline: 1px dashed color-mix(in oklch, var(--paper-ink) 30%, transparent);
  outline-offset: -5px;
  color: var(--paper-ink);
  .h {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-base);
    font-weight: 700;
    margin-block-end: 4px;
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--who);
    }
    small {
      margin-inline-start: auto;
      font-size: var(--font-2xs);
      font-weight: 400;
      color: var(--paper-muted);
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
      font-weight: 700;
    }
    .ok {
      background: var(--paper-ink);
      color: var(--paper-white);
    }
    .no {
      color: var(--paper-muted);
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--paper-ink) 18%, transparent);
    }
  }
}

.appendix {
  & + .appendix {
    margin-block-start: 18px;
  }
}

/* the appendix: a checklist written on the notes' own paper */
.check {
  list-style: none;
  margin: 0;
  padding: 4px 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  label {
    display: flex;
    gap: 12px;
    align-items: center;
    min-height: 48px;
    padding: 10px 12px;
    background: var(--card, var(--paper-white));
    color: var(--paper-ink);
    border-radius: 6px;
    box-shadow: var(--shadow-paper);
    font-size: var(--font-base);
    .muted {
      color: var(--paper-muted);
    }
  }
  input {
    width: 22px;
    height: 22px;
    margin: 0;
    flex-shrink: 0;
    accent-color: var(--paper-ink);
  }
  /* ticked: struck through in the paper's quieter ink, still readable */
  .checked .t {
    color: var(--paper-muted);
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
  }
}

.foot {
  padding: 10px max(16px, calc((100% - 648px) / 2)) 12px;
  border-top: 1px solid var(--line);
  background: var(--bg);
}

.export {
  width: 100%;
  height: 48px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--on-ink);
  font-size: var(--font-base);
  font-weight: 700;
}
</style>
