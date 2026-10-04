import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { defineStore } from "pinia";

import { useQueryState } from "@pinia/colada";

import { currencyCode } from "../../shared/money";

import type { NoteStatus } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { MAX_NAME } from "../rooms/newRoom";
import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import * as itinerary from "./itinerary";
import type { Flight, Flights, Leg } from "./types";

/**
 * The trip's days, and the notes placed on them. The trip itself is what the query cache holds
 * (keys.ts), written by the room (docs/data-fetching.md).
 */
export const useTrip = defineStore("trip", () => {
  const store = useNotes();
  const sync = useSync();
  /** Undefined until the room's first snapshot */
  const { data: trip } = useQueryState(() => roomKeys.trip(sync.room.id));

  const name = computed(() => trip.value?.name ?? "");
  const days = computed(() => trip.value?.days ?? []);
  const currency = computed(() => trip.value?.currency ?? currencyCode("USD")!);
  const center = computed(() => trip.value?.center ?? null);
  const flights = computed((): Flights => trip.value?.flights ?? { out: null, back: null });

  const unassigned = computed(() => itinerary.unassigned(store.notes ?? []));
  const forDay = (date: Temporal.PlainDate, status?: NoteStatus) =>
    itinerary.forDay(store.notes ?? [], date, status);
  const byTag = (tag: string) => itinerary.byTag(store.notes ?? [], tag);
  const budgetOf = (date?: Temporal.PlainDate, onlyFixed = true) =>
    itinerary.budgetOf(store.notes ?? [], date, onlyFixed);
  const fixedCount = computed(() => itinerary.fixedCount(store.notes ?? []));
  const dayNumber = (date: Temporal.PlainDate) => itinerary.dayNumber(days.value, date);

  const dayOf = (date: Temporal.PlainDate) => days.value.find((d) => d.date.equals(date));

  /** Committed to the room, which shows it at once (ledger.ts) */
  function setIntro(date: Temporal.PlainDate, intro: string) {
    sync.commit({ type: "day:intro", date, intro });
  }
  /** When the trip is: `days` days from `first`; what is planned moves with it (apply.ts) */
  function setDates(first: Temporal.PlainDate, days: number) {
    const was = trip.value?.days ?? [];
    if (was.length === days && was[0]?.date.equals(first)) return;
    sync.commit({ type: "trip:dates", first, days });
  }
  /** One of the trip's flights, or none */
  function setFlight(leg: Leg, flight: Flight | null) {
    sync.commit({ type: "trip:flight", leg, flight });
  }
  /** A new name for the trip; a blank one, or the same one, changes nothing */
  function rename(next: string) {
    const n = next.trim();
    if (n === "" || n === name.value) return;
    sync.commit({ type: "trip:rename", name: n.slice(0, MAX_NAME) });
  }

  return {
    name,
    days,
    currency,
    center,
    flights,
    unassigned,
    forDay,
    byTag,
    budgetOf,
    fixedCount,
    dayNumber,
    dayOf,
    setIntro,
    rename,
    setDates,
    setFlight,
  };
});
