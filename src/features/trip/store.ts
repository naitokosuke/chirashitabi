import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { Temporal } from "temporal-polyfill-lite";
import { useNotes } from "@/features/notes/store";
import { PACKING_TAG, type Note } from "@/features/notes/types";
import { useSync } from "@/features/sync/store";

export interface Day {
  date: Temporal.PlainDate;
  intro: string; // 2-3 lines written for the booklet, not a note
}

const TRIP_START = Temporal.PlainDate.from("2026-11-03");
const TRIP_DAYS = 4;

const onDay = (n: Note, date: Temporal.PlainDate) => n.date?.equals(date) ?? false;
// untimed items ("Anytime") go last; ties fall back to edit order
const byTime = (a: Note, b: Note) =>
  (a.time && b.time ? Temporal.PlainTime.compare(a.time, b.time) : +!a.time - +!b.time) ||
  Temporal.Instant.compare(a.updatedAt, b.updatedAt);

/** The trip's days, and the notes placed on them. */
export const useTrip = defineStore("trip", () => {
  const store = useNotes();
  const sync = useSync();
  const days = ref<Day[]>(
    Array.from({ length: TRIP_DAYS }, (_, i) => ({ date: TRIP_START.add({ days: i }), intro: "" })),
  );

  const unassigned = computed(() =>
    store.notes.filter((n) => n.kind === "note" && !n.date && !n.tags.includes(PACKING_TAG)),
  );
  const forDay = (date: Temporal.PlainDate, status?: Note["status"]) =>
    store.notes
      .filter(
        (n) => n.kind === "note" && onDay(n, date) && (!status || (n.status ?? "idea") === status),
      )
      .sort(byTime);
  const byTag = (tag: string) =>
    store.notes.filter((n) => n.kind === "note" && n.tags.includes(tag));
  const budgetOf = (date?: Temporal.PlainDate, onlyFixed = true) =>
    store.notes
      .filter(
        (n) =>
          n.kind === "note" && (!date || onDay(n, date)) && (!onlyFixed || n.status === "fixed"),
      )
      .reduce((s, n) => s + (n.budget ?? 0), 0);

  const dayOf = (date: Temporal.PlainDate) => days.value.find((d) => d.date.equals(date));
  function setIntro(date: Temporal.PlainDate, intro: string) {
    const d = dayOf(date);
    if (d) d.intro = intro;
    sync.send({ type: "day:intro", date, intro });
  }

  return { days, unassigned, forDay, byTag, budgetOf, dayOf, setIntro };
});
