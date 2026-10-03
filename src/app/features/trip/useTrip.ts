import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { defineStore } from "pinia";

import { useQueryCache } from "@pinia/colada";

import { currencyCode } from "../../shared/money";

import type { NoteStatus } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { roomKey } from "../sync/keys";
import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

import { applyToDays } from "./apply";
import * as itinerary from "./itinerary";
import type { TripSnapshot } from "./types";

/**
 * The trip's days, and the notes placed on them. The trip itself sits in the query cache
 * under `roomKey(room, "trip")` and is replaced, never changed in place (docs/data-fetching.md).
 */
export const useTrip = defineStore("trip", () => {
  const store = useNotes();
  const sync = useSync();
  const queryCache = useQueryCache();
  const key = computed(() => roomKey(sync.roomId, "trip"));
  /** Null until the room's first snapshot */
  const trip = computed(() => queryCache.getQueryData<TripSnapshot>(key.value) ?? null);
  const write = (next: TripSnapshot) => queryCache.setQueryData(key.value, next);

  const name = computed(() => trip.value?.name ?? "");
  const days = computed(() => trip.value?.days ?? []);
  const currency = computed(() => trip.value?.currency ?? currencyCode("USD")!);
  const center = computed(() => trip.value?.center ?? null);

  const unassigned = computed(() => itinerary.unassigned(store.notes));
  const forDay = (date: Temporal.PlainDate, status?: NoteStatus) =>
    itinerary.forDay(store.notes, date, status);
  const byTag = (tag: string) => itinerary.byTag(store.notes, tag);
  const budgetOf = (date?: Temporal.PlainDate, onlyFixed = true) =>
    itinerary.budgetOf(store.notes, date, onlyFixed);
  const fixedCount = computed(() => itinerary.fixedCount(store.notes));
  const dayNumber = (date: Temporal.PlainDate) => itinerary.dayNumber(days.value, date);

  const dayOf = (date: Temporal.PlainDate) => days.value.find((d) => d.date.equals(date));

  /** Ours and the room's alike; nothing to apply before the first snapshot */
  function applyDays(m: Mutation) {
    const t = trip.value;
    if (t === null) return;
    const next = applyToDays(t.days, m);
    if (next !== t.days) write({ ...t, days: next });
  }
  function setIntro(date: Temporal.PlainDate, intro: string) {
    const m: Mutation = { type: "day:intro", date, intro };
    applyDays(m);
    sync.send(m);
  }

  /** A day's intro as the room relays it: applied, never sent */
  function receive(m: Mutation) {
    applyDays(m);
  }

  /** Called by the room when an authoritative snapshot arrives. */
  function apply(snapshot: TripSnapshot) {
    write(snapshot);
  }

  return {
    name,
    days,
    currency,
    center,
    unassigned,
    forDay,
    byTag,
    budgetOf,
    fixedCount,
    dayNumber,
    dayOf,
    setIntro,
    receive,
    apply,
  };
});
