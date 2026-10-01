import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Temporal } from "temporal-polyfill-lite";
import { useNotes } from "@/features/notes/store";
import type { NoteStatus } from "@/features/notes/types";
import type { LatLng } from "@/features/place/types";
import { useSync } from "@/features/sync/store";
import * as itinerary from "./itinerary";

export interface Day {
  date: Temporal.PlainDate;
  intro: string; // 2-3 lines written for the booklet, not a note
}

/** What the room knows about the trip itself */
export interface TripSnapshot {
  name: string; // the room name, e.g. "Taiwan trip"
  days: Day[];
  currency: string; // ISO 4217, for budgets: "TWD", "JPY", …
  center: LatLng; // where the map opens
}

/** The trip's days, and the notes placed on them. */
export const useTrip = defineStore("trip", () => {
  const store = useNotes();
  const sync = useSync();
  const name = ref("");
  const days = ref<Day[]>([]);
  const currency = ref("USD");
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
    const d = dayOf(date);
    if (d) d.intro = intro;
    sync.send({ type: "day:intro", date, intro });
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
    apply,
  };
});
