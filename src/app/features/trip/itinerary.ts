import { Temporal } from "temporal-polyfill-lite";
import {
  PACKING_TAG,
  type Memo,
  type MemoPatch,
  type Note,
  type NoteStatus,
  type Schedule,
  type Scheduled,
} from "@/features/notes/types";
import type { DayDraft } from "@/features/worker/types";

export const STATUS_LABEL: Record<NoteStatus, string> = {
  idea: "Maybe",
  fixed: "Confirmed",
  done: "Done",
};
const NEXT_STATUS: Record<NoteStatus, NoteStatus> = { idea: "fixed", fixed: "done", done: "idea" };
/** Maybe -> Confirmed -> Done -> Maybe */
export const cycleStatus = (s: Schedule): Schedule => ({ ...s, status: NEXT_STATUS[s.status] });

const isMemo = (n: Note): n is Memo => n.kind === "memo";
const isScheduled = (n: Note): n is Scheduled => isMemo(n) && n.schedule !== null;
const onDay = (n: Memo, date: Temporal.PlainDate) => n.schedule?.date.equals(date) ?? false;
const isFixed = (n: Memo) => n.schedule?.status === "fixed";
// untimed items ("Anytime") go last; ties fall back to edit order
function byTime(a: Scheduled, b: Scheduled) {
  const [ta, tb] = [a.schedule.time, b.schedule.time];
  return (
    (ta && tb ? Temporal.PlainTime.compare(ta, tb) : +!ta - +!tb) ||
    Temporal.Instant.compare(a.updatedAt, b.updatedAt)
  );
}

/** Memos still waiting for a day (packing notes never need one) */
export const unassigned = (notes: Note[]) =>
  notes.filter(isMemo).filter((n) => n.schedule === null && !n.tags.includes(PACKING_TAG));

/** A day's memos in time order, optionally only those with `status` */
export const forDay = (notes: Note[], date: Temporal.PlainDate, status?: NoteStatus) =>
  notes
    .filter(isScheduled)
    .filter((n) => n.schedule.date.equals(date) && (!status || n.schedule.status === status))
    .sort(byTime);

export const byTag = (notes: Note[], tag: string) =>
  notes.filter(isMemo).filter((n) => n.tags.includes(tag));

/** The sum of budgets, for one day or the whole trip; by default only what is confirmed */
export const budgetOf = (notes: Note[], date?: Temporal.PlainDate, onlyFixed = true) =>
  notes
    .filter(isMemo)
    .filter((n) => (!date || onDay(n, date)) && (!onlyFixed || isFixed(n)))
    .reduce((s, n) => s + (n.budget ?? 0), 0);

export const fixedCount = (notes: Note[]) => notes.filter(isMemo).filter(isFixed).length;

/** "Day 1" is the first day of the trip */
export const dayNumber = (days: { date: Temporal.PlainDate }[], date: Temporal.PlainDate) =>
  days.findIndex((d) => d.date.equals(date)) + 1;

/** Put a memo on a day (keeping its time and status), or take it off the itinerary */
export const assignTo = (n: Memo, date: Temporal.PlainDate | null): MemoPatch => ({
  schedule: date && {
    date,
    time: n.schedule?.time ?? null,
    status: n.schedule?.status ?? "idea",
  },
});

/** Adopting a draft confirms every item it gave a time */
export const draftUpdates = (draft: DayDraft) =>
  draft.items.flatMap(({ note, time }) =>
    time
      ? [
          {
            id: note.id,
            patch: { schedule: { ...note.schedule, time, status: "fixed" } } satisfies MemoPatch,
          },
        ]
      : [],
  );
