import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { defineQuery } from "@pinia/colada";

import { MAX_NAME } from "../../../contract/room";
import type { NoteStatus, Tag } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { useSync } from "../sync/useSync";

import * as itinerary from "./itinerary";
import type { Flight, Leg, Stay } from "./types";

/**
 * The notes placed on the trip's days, and the changes to the trip. The trip itself is what the
 * query cache holds (keys.ts), written by the room (docs/data-fetching.md); a view inside a
 * room reads it from InRoom, where it is always there. Defined once for the app (defineQuery).
 */
export const useTrip = defineQuery(() => {
  const { notes } = useNotes();
  const sync = useSync();

  const unassigned = computed(() => itinerary.unassigned(notes.value ?? []));
  const forDay = (date: Temporal.PlainDate, status?: NoteStatus) =>
    itinerary.forDay(notes.value ?? [], date, status);
  const byTag = (tag: Tag) => itinerary.byTag(notes.value ?? [], tag);
  const budgetOf = (date?: Temporal.PlainDate, onlyFixed = true) =>
    itinerary.budgetOf(notes.value ?? [], date, onlyFixed);
  const fixedCount = computed(() => itinerary.fixedCount(notes.value ?? []));

  /** Committed to the room, which shows it at once (ledger.ts) */
  function setIntro(date: Temporal.PlainDate, intro: string) {
    sync.commit({ type: "day:intro", date, intro });
  }
  /** When the trip is: `days` days from `first`; what is planned moves with it (apply.ts) */
  function setDates(first: Temporal.PlainDate, days: number) {
    sync.commit({ type: "trip:dates", first, days });
  }
  /** One of the trip's flights, or none */
  function setFlight(leg: Leg, flight: Flight | null) {
    sync.commit({ type: "trip:flight", leg, flight });
  }
  /** Where the nights are spent, the whole list at once */
  function setStays(stays: Stay[]) {
    sync.commit({ type: "trip:stays", stays });
  }
  /** A new name for the trip; a blank one changes nothing */
  function rename(next: string) {
    const n = next.trim();
    if (n === "") return;
    sync.commit({ type: "trip:rename", name: n.slice(0, MAX_NAME) });
  }

  return {
    unassigned,
    forDay,
    byTag,
    budgetOf,
    fixedCount,
    setIntro,
    rename,
    setDates,
    setFlight,
    setStays,
  };
});
