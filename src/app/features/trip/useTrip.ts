import type { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { defineQuery } from "@pinia/colada";

import type { NoteStatus, Tag } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

import * as itinerary from "./itinerary";
import type { TripChanges } from "./settings";

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
  /**
   * The trip's settings as the editor saves them (settings.ts): its name, when it is (what is
   * planned moves with it: apply.ts), its flights and where its nights are spent, all of them
   * or none; whether they were saved
   */
  function save(c: TripChanges) {
    const ms: Mutation[] = [];
    if (c.name !== null) ms.push({ type: "trip:rename", name: c.name });
    if (c.dates !== null) ms.push({ type: "trip:dates", ...c.dates });
    for (const { leg, flight } of c.flights) ms.push({ type: "trip:flight", leg, flight });
    if (c.stays !== null) ms.push({ type: "trip:stays", stays: c.stays });
    return sync.commit(...ms);
  }

  return {
    unassigned,
    forDay,
    byTag,
    budgetOf,
    fixedCount,
    setIntro,
    save,
  };
});
