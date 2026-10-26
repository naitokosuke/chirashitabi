<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, onActivated, ref, shallowReactive, useTemplateRef } from "vue";

import {
  CtGlass,
  CtHeading,
  CtHint,
  CtSegmented,
  CtTabList,
  CtTabPanel,
  CtTextMorph,
  usePageTurn,
  type CtMorphPart,
} from "../../../../ui/index";

import { formatMoney } from "../../../shared/money";
import { useToday } from "../../../shared/useToday";

import { useI18n } from "../../../i18n/useI18n";

import type { NoteId } from "../../../features/notes/id";
import Appendix from "../../../features/shiori/Appendix.vue";
import DayEdit from "../../../features/shiori/DayEdit.vue";
import DayRead from "../../../features/shiori/DayRead.vue";
import Tray from "../../../features/shiori/Tray.vue";
import { useInRoom } from "../../../features/sync/InRoom.vue";
import { longDate, shortDate } from "../../../features/trip/format";
import { dayNumber } from "../../../features/trip/itinerary";
import { useTrip } from "../../../features/trip/useTrip";

const { budgetOf, fixedCount } = useTrip();
/** The trip the booklet is of */
const here = useInRoom();
const i18n = useI18n();

/**
 * A choice the page follows a beat late: `picked` answers the tap at once (the tabs, the
 * heading, the switch); `shown` is what the page shows, once the old page has cleared (turnTo)
 */
interface Turning<T> {
  picked: T;
  shown: T;
}
/** A picked day, the appendix, or null for "today if the trip is on, else the first day" */
type Tab = Temporal.PlainDate | "appendix" | null;
const tab = shallowReactive<Turning<Tab>>({ picked: null, shown: null });
/** Edit and read are the same page written two ways; the tray is edit's too */
type Mode = "edit" | "read";
const mode = shallowReactive<Turning<Mode>>({ picked: "edit", shown: "edit" });
/** The memo picked in the tray to put on a day, by id, kept while the booklet is read */
const pickingId = ref<NoteId | null>(null);

const today = useToday();
const openingDay = computed(
  () =>
    here.trip.days.find((d) => d.date.equals(today.value))?.date ?? here.trip.days[0]?.date ?? null,
);
/**
 * The day a tab is, one of the trip's: a picked day the trip no longer has (made shorter
 * meanwhile, here or by the partner) is the opening day, as no pick is
 */
const dayOfTab = (t: Tab) => {
  if (t === "appendix") return null;
  return here.trip.days.find((d) => t !== null && d.date.equals(t))?.date ?? openingDay.value;
};
/** The day on the page, or null on the appendix tab */
const day = computed(() => dayOfTab(tab.shown));
/** The day the tabs and the heading show, ahead of the page by the time it takes to turn */
const pickedDay = computed(() => dayOfTab(tab.picked));
const price = (amount: number) => formatMoney(amount, here.trip.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);

const totalFixed = computed(() => budgetOf(undefined, true));
const totalAll = computed(() => budgetOf(undefined, false));
/** "11/3 – 11/5", or one date for a day trip */
const range = computed(() => {
  const first = here.trip.days[0]?.date;
  const last = here.trip.days.at(-1)?.date;
  if (first === undefined || last === undefined) return null;
  return first.equals(last) ? short(first) : `${short(first)} – ${short(last)}`;
});

// tabs are keyed by the date's ISO string
const APPENDIX = "appendix";
const dayTabs = computed(() => [
  ...here.trip.days.map((d) => ({
    value: d.date.toString(),
    label: i18n.t("shiori.dayTab", { n: dayNumber(here.trip.days, d.date), date: short(d.date) }),
  })),
  { value: APPENDIX, label: i18n.t("shiori.appendix") },
]);
const activeTab = computed(() => pickedDay.value?.toString() ?? APPENDIX);
/** "1日目 11/3(火)" with the date in its own tone, or "付録" */
const heading = computed((): CtMorphPart[] => {
  const date = pickedDay.value;
  if (date === null) return [{ text: i18n.t("shiori.appendix") }];
  return i18n
    .parts("shiori.dayHeading", {
      n: dayNumber(here.trip.days, date),
      date: longDate(date, i18n.locale),
    })
    .map((s) => (s.kind === "text" ? { text: s.text } : { text: s.text, tone: "quiet" }));
});
const modes = computed((): { value: Mode; label: string }[] => [
  { value: "edit", label: i18n.t("common.edit") },
  { value: "read", label: i18n.t("shiori.read") },
]);

const page = useTemplateRef<HTMLElement>("page");
const turn = usePageTurn(page);
/** The choice moves at once; the page clears, then its new pieces are laid down */
function turnTo<T>(choice: Turning<T>, next: T) {
  choice.picked = next;
  void turn(() => (choice.shown = next));
}
/** Turns to a day, or the appendix, unless the page is on it already */
function showTab(next: Tab) {
  if ((dayOfTab(next)?.toString() ?? APPENDIX) === activeTab.value) return;
  turnTo(tab, next);
}
/**
 * How far down the page (the day's or the appendix's) has been read. Kept while another tab is
 * up, the booklet is out of the document, which forgets a box's scroll: back in it, the page
 * is put where it was.
 */
let scrolled = 0;
function keepScroll() {
  scrolled = page.value?.scrollTop ?? 0;
}
onActivated(() => {
  if (page.value !== null) page.value.scrollTop = scrolled;
});
/** The tab a key of the list names */
const tabOf = (value: string): Tab =>
  value === APPENDIX ? "appendix" : Temporal.PlainDate.from(value);
</script>

<template>
  <article>
    <!-- no bar: the days and the edit/read switch float along the top, on glass -->
    <div class="top">
      <CtGlass class="days">
        <CtTabList
          :label="i18n.t('shiori.days')"
          :tabs="dayTabs"
          variant="pill"
          :model-value="activeTab"
          @update:model-value="(v) => showTab(tabOf(v))"
        />
      </CtGlass>
      <CtGlass class="mode">
        <CtSegmented
          :model-value="mode.picked"
          :label="i18n.t('shiori.mode')"
          :options="modes"
          @update:model-value="(m) => turnTo(mode, m)"
        />
      </CtGlass>
    </div>

    <!-- what holds for the whole trip stays put above the page; only the day's page morphs -->
    <div class="lead">
      <CtHint size="sm"><template v-if="range !== null">{{ range }} · </template>{{
          totalAll > 0
            ? i18n.t("shiori.summary", { fixed: fixedCount, total: price(totalFixed) })
            : i18n.t("shiori.summaryCount", { fixed: fixedCount })
        }}<small v-if="totalAll > totalFixed">{{
          i18n.t("shiori.withMaybes", { total: price(totalAll) })
        }}</small></CtHint>

      <!-- tray: memos without a day (edit mode only); one put on a day turns the page to it -->
      <Tray v-if="mode.shown === 'edit'" v-model:picking="pickingId" @put="showTab" />

      <!-- the open day's heading stays put while its page slides; only the characters that change move -->
      <CtHeading :aria-label="heading.map((p) => p.text).join('')"><CtTextMorph :parts="heading" /></CtHeading>
    </div>

    <div ref="page" class="page" @scroll="keepScroll">
      <!-- the page (this scrolling body) morphs when the day or the mode changes: see turnTo -->
      <CtTabPanel>
        <Appendix v-if="day === null" />
        <DayEdit v-else-if="mode.shown === 'edit'" :day :today />
        <DayRead v-else :day :today />
      </CtTabPanel>
    </div>

  </article>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

article {
  position: absolute;
  inset: 0;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  /* under the row that floats at the top, and above the dock */
  padding-block: var(--top-clear) var(--dock-clear);

  /* the days and the switch, floating in the row where a bar would be */
  > .top {
    position: absolute;
    inset-inline: 0;
    inset-block-start: 0;
    z-index: var(--z-chrome);
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-height: var(--top-row);
    /* in the page's column, so the days start where the page does */
    padding: var(--top-inset) var(--page-margin) 0;
    pointer-events: none;

    > * {
      pointer-events: auto;
    }

    /* the days: as wide as they need, scrolling past the column's width */
    > .days {
      flex: 0 1 auto;
    }

    /* the edit/read switch, at the end */
    > .mode {
      flex-shrink: 0;
      margin-inline-start: auto;
    }
  }

  /* above the page and never scrolled: the trip's sums and, in edit mode, the tray (Tray) */
  > .lead {
    position: relative;
    flex-shrink: 0;
    padding: 0 var(--page-margin) var(--space-2);

    /* the page's edge: a hairline across the column, not the screen */
    &::after {
      content: "";
      position: absolute;
      inset-inline: var(--page-margin);
      inset-block-end: 0;
      height: 1px;
      background: var(--line);
    }

    > p {
      margin: var(--space-5) 0 0;

      > small {
        font-size: var(--font-xs);
      }
    }

    /* the open day's heading, at the foot of the lead, over the page */
    > h2 {
      margin: var(--space-7) 0 var(--space-5);
    }
  }

  /* a booklet is read at a page's width, on a laptop too; the day's or the appendix's page in it */
  > .page {
    flex: 1;
    overflow-y: auto;
    /* clear of the lead's edge before the day starts */
    padding: var(--space-8) var(--page-margin) var(--space-12);
  }
}
</style>
