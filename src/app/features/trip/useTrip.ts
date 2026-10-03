import type { Temporal } from "temporal-polyfill-lite";

import { computed, ref, shallowRef } from "vue";

import { defineStore } from "pinia";

import { currencyCode } from "../../shared/money";

import type { NoteStatus } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import type { LatLng } from "../place/types";
import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

import { applyToDays } from "./apply";
import * as itinerary from "./itinerary";
import type { Day, TripSnapshot } from "./types";

/** The trip's days, and the notes placed on them. */
export const useTrip = defineStore("trip", () => {
  const store = useNotes();
  const sync = useSync();
  const name = ref("");
  // replaced, never changed in place (apply.ts)
  const days = shallowRef<Day[]>([]);
  const currency = ref(currencyCode("USD")!);
  const center = ref<LatLng | null>(null);

  const unassigned = computed(() => itinerary.unassigned(store.notes));
  const forDay = (date: Temporal.PlainDate, status?: NoteStatus) =>
    itinerary.forDay(store.notes, date, status);
  const byTag = (tag: string) => itinerary.byTag(store.notes, tag);
  const budgetOf = (date?: Temporal.PlainDate, onlyFixed = true) =>
    itinerary.budgetOf(store.notes, date, onlyFixed);
  const fixedCount = computed(() => itinerary.fixedCount(store.notes));
  const dayNumber = (date: Temporal.PlainDate) => itinerary.dayNumber(days.value, date);

  const dayOf = (date: Temporal.PlainDate) => days.value.find((d) => d.date.equals(date));
  function setIntro(date: Temporal.PlainDate, intro: string) {
    const m: Mutation = { type: "day:intro", date, intro };
    days.value = applyToDays(days.value, m);
    sync.send(m);
  }

  /** A day's intro as the room relays it: applied, never sent */
  function receive(m: Mutation) {
    days.value = applyToDays(days.value, m);
  }

  /** Called by the room when an authoritative snapshot arrives. */
  function apply(snapshot: TripSnapshot) {
    name.value = snapshot.name;
    days.value = snapshot.days;
    currency.value = snapshot.currency;
    center.value = snapshot.center;
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
