import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { defineQuery, useQueryState } from "@pinia/colada";

import type { NoteStatus } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { MAX_NAME } from "../rooms/newRoom";
import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import * as itinerary from "./itinerary";
import type { Flight, Leg } from "./types";

/**
 * The trip, and the notes placed on its days. The trip itself is what the query cache holds
 * (keys.ts), written by the room (docs/data-fetching.md); undefined until the room's first
 * snapshot. Defined once for the app (defineQuery).
 */
export const useTrip = defineQuery(() => {
  const { notes } = useNotes();
  const sync = useSync();
  const { data: trip } = useQueryState(() => roomKeys.trip(sync.room.id));

  const unassigned = computed(() => itinerary.unassigned(notes.value ?? []));
  const forDay = (date: Temporal.PlainDate, status?: NoteStatus) =>
    itinerary.forDay(notes.value ?? [], date, status);
  const byTag = (tag: string) => itinerary.byTag(notes.value ?? [], tag);
  const budgetOf = (date?: Temporal.PlainDate, onlyFixed = true) =>
    itinerary.budgetOf(notes.value ?? [], date, onlyFixed);
  const fixedCount = computed(() => itinerary.fixedCount(notes.value ?? []));
  const dayNumber = (date: Temporal.PlainDate) => itinerary.dayNumber(trip.value?.days ?? [], date);
  const dayOf = (date: Temporal.PlainDate) => trip.value?.days.find((d) => d.date.equals(date));

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
    if (n === "" || n === trip.value?.name) return;
    sync.commit({ type: "trip:rename", name: n.slice(0, MAX_NAME) });
  }

  return {
    trip,
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
