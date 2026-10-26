<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { CtButton, CtHint, CtPanel, CtPaper, CtPress, CtScrollRow } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { paperOf } from "../members/paper";
import { useMembers } from "../members/useMembers";
import type { NoteId } from "../notes/id";
import type { Memo } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { useInRoom } from "../sync/InRoom.vue";
import { shortDate } from "../trip/format";
import { assignTo } from "../trip/itinerary";
import { useTrip } from "../trip/useTrip";

/**
 * The memos still without a day, each a slip of its writer's paper: one is picked, then put on
 * a day of the trip, or left for later. The pick (`picking`, by id) is the owner's, so it outlives
 * the tray while the booklet is read. Once it is on a day, that day is said (`put`), for the
 * booklet to turn to.
 */
const emit = defineEmits<{ put: [date: Temporal.PlainDate] }>();
const pickingId = defineModel<NoteId | null>("picking", { required: true });
const store = useNotes();
const { unassigned } = useTrip();
/** The trip whose days the memo is put on */
const here = useInRoom();
const { members } = useMembers();
const i18n = useI18n();
/** A note's paper: whoever wrote it */
const paperFor = (n: Memo) => paperOf(members.value?.find((m) => m.id === n.by)?.color);

/**
 * That memo as it is now, while it still has no day: if the partner gives it one, or it goes,
 * there is nothing left to put anywhere
 */
const picking = computed(() => unassigned.value.find((n) => n.id === pickingId.value) ?? null);
function togglePick(n: Memo) {
  pickingId.value = pickingId.value === n.id ? null : n.id;
}
/** The picked memo goes on this day */
function putPickedOn(date: Temporal.PlainDate) {
  const n = picking.value;
  if (n === null) return;
  store.update(n.id, assignTo(n, date));
  pickingId.value = null;
  emit("put", date);
}
</script>

<template>
  <CtPanel as="section" class="tray">
    <div><span>{{ i18n.t("shiori.trayTitle", { count: unassigned.length }) }}</span><small>{{
        i18n.t("shiori.trayHint")
      }}</small></div>
    <CtHint v-if="unassigned.length === 0" size="sm">{{ i18n.t("shiori.trayEmpty") }}</CtHint>
    <CtScrollRow v-else as="ul">
      <!-- each a slip of its writer's paper; the tap anywhere on it is its button's -->
      <li v-for="n in unassigned" :key="n.id">
        <CtPaper :paper="paperFor(n)" :selected="picking?.id === n.id">
          <template #default>
            <CtPress cover :aria-pressed="picking?.id === n.id" @click="() => togglePick(n)">{{
              n.title
            }}</CtPress>
          </template>
          <template #foot>
            <span v-for="t in n.tags" :key="t">#{{ t }}</span>
          </template>
        </CtPaper>
      </li>
    </CtScrollRow>
    <div v-if="picking !== null">
      <span>{{ i18n.t("shiori.putOn", { title: picking.title }) }}</span>
      <CtButton
        v-for="d in here.trip.days"
        :key="d.date.toString()"
        variant="primary"
        @click="() => putPickedOn(d.date)"
      >{{ shortDate(d.date, i18n.locale) }}</CtButton>
      <CtButton @click="() => (pickingId = null)">{{ i18n.t("shiori.later") }}</CtButton>
    </div>
  </CtPanel>
</template>

<style scoped>
/* the notes still without a day, on a tool panel above the page */
section.tray {
  margin-block: 10px 6px;

  > div:first-child {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-sm);
    font-weight: 700;
    margin-block-end: 6px;

    > small {
      color: var(--muted);
      font-size: var(--font-sm);
    }
  }

  > p {
    padding: 14px 0;
  }

  /* each slip as tall as the tallest */
  > ul > li {
    flex-shrink: 0;
    align-self: stretch;
    display: flex;
    /* the slip's title (a CtPress over the whole slip) in this type */
    font-size: var(--font-sm);
    font-weight: 700;
    line-height: 1.35;

    span {
      font-size: var(--font-xs);
      font-weight: 700;
      color: var(--paper-muted);
    }
  }

  > div:last-child {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding-block-start: 6px;

    > span {
      font-size: var(--font-sm);
      font-weight: 700;
      margin-inline-end: 4px;
    }
  }
}
</style>
