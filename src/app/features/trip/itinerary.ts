import { Temporal } from "temporal-polyfill-lite";
import { PACKING_TAG, type Note, type NoteStatus } from "@/features/notes/types";
import type { DayDraft } from "@/features/worker/store";

export const STATUS_LABEL: Record<NoteStatus, string> = {
  idea: "Maybe",
  fixed: "Confirmed",
  done: "Done",
};
const NEXT_STATUS: Record<NoteStatus, NoteStatus> = { idea: "fixed", fixed: "done", done: "idea" };
/** A note without a status is still a maybe */
export const statusOf = (n: Note): NoteStatus => n.status ?? "idea";
/** Maybe -> Confirmed -> Done -> Maybe */
export const nextStatus = (n: Note) => NEXT_STATUS[statusOf(n)];

const onDay = (n: Note, date: Temporal.PlainDate) => n.date?.equals(date) ?? false;
// untimed items ("Anytime") go last; ties fall back to edit order
const byTime = (a: Note, b: Note) =>
  (a.time && b.time ? Temporal.PlainTime.compare(a.time, b.time) : +!a.time - +!b.time) ||
  Temporal.Instant.compare(a.updatedAt, b.updatedAt);

/** Notes still waiting for a day (packing notes never need one) */
export const unassigned = (notes: Note[]) =>
  notes.filter((n) => n.kind === "note" && !n.date && !n.tags.includes(PACKING_TAG));

/** A day's notes in time order, optionally only those with `status` */
export const forDay = (notes: Note[], date: Temporal.PlainDate, status?: NoteStatus) =>
  notes
    .filter((n) => n.kind === "note" && onDay(n, date) && (!status || statusOf(n) === status))
    .sort(byTime);

export const byTag = (notes: Note[], tag: string) =>
  notes.filter((n) => n.kind === "note" && n.tags.includes(tag));

/** The sum of budgets, for one day or the whole trip; by default only what is confirmed */
export const budgetOf = (notes: Note[], date?: Temporal.PlainDate, onlyFixed = true) =>
  notes
    .filter(
      (n) => n.kind === "note" && (!date || onDay(n, date)) && (!onlyFixed || n.status === "fixed"),
    )
    .reduce((s, n) => s + (n.budget ?? 0), 0);

export const fixedCount = (notes: Note[]) => notes.filter((n) => n.status === "fixed").length;

/** "Day 1" is the first day of the trip */
export const dayNumber = (days: { date: Temporal.PlainDate }[], date: Temporal.PlainDate) =>
  days.findIndex((d) => d.date.equals(date)) + 1;

/** Put a note on a day (keeping its time and status), or take it off and back to a maybe */
export const assignTo = (n: Note, date: Temporal.PlainDate | null): Partial<Note> =>
  date
    ? { date, time: n.time, status: statusOf(n) }
    : { date: undefined, time: undefined, status: "idea" };

/** Adopting a draft confirms every item it gave a time */
export const draftUpdates = (draft: DayDraft) =>
  draft.items.flatMap(({ note, time }) =>
    time ? [{ id: note.id, patch: { time, status: "fixed" } satisfies Partial<Note> }] : [],
  );
