import { Temporal } from "temporal-polyfill-lite";

import type { NoteStatus } from "../../../contract/room";
import {
  PACKING_TAG,
  type Memo,
  type MemoPatch,
  type Note,
  type Schedule,
  type Scheduled,
} from "../notes/types";
import type { DayDraft } from "../worker/types";

import type { Flight, Leg, Stay } from "./types";

const NEXT_STATUS: Record<NoteStatus, NoteStatus> = { idea: "fixed", fixed: "done", done: "idea" };
/** Maybe -> Confirmed -> Done -> Maybe */
export const cycleStatus = (s: Schedule): Schedule => ({ ...s, status: NEXT_STATUS[s.status] });

const isMemo = (n: Note): n is Memo => n.kind === "memo";
const isScheduled = (n: Note): n is Scheduled => isMemo(n) && n.schedule !== null;
const onDay = (n: Memo, date: Temporal.PlainDate) => n.schedule?.date.equals(date) ?? false;
const isFixed = (n: Memo) => n.schedule?.status === "fixed";
// Only the clock orders a day; untimed items ("Anytime") go last. Ties keep the list's own order,
// which is the order the notes were written, so tapping a status never moves a card.
function byTime(a: Scheduled, b: Scheduled) {
  const [ta, tb] = [a.schedule.time, b.schedule.time];
  return ta !== null && tb !== null
    ? Temporal.PlainTime.compare(ta, tb)
    : Number(ta === null) - Number(tb === null);
}

/** Memos still waiting for a day (packing notes never need one) */
export const unassigned = (notes: Note[]) =>
  notes.filter(isMemo).filter((n) => n.schedule === null && !n.tags.includes(PACKING_TAG));

/** A day's memos in time order, optionally only those with `status` */
export const forDay = (notes: Note[], date: Temporal.PlainDate, status?: NoteStatus) =>
  notes
    .filter(isScheduled)
    .filter(
      (n) => n.schedule.date.equals(date) && (status === undefined || n.schedule.status === status),
    )
    .sort(byTime);

export const byTag = (notes: Note[], tag: string) =>
  notes.filter(isMemo).filter((n) => n.tags.includes(tag));

/** The sum of budgets, for one day or the whole trip; by default only what is confirmed */
export const budgetOf = (notes: Note[], date?: Temporal.PlainDate, onlyFixed = true) =>
  notes
    .filter(isMemo)
    .filter((n) => (date === undefined || onDay(n, date)) && (!onlyFixed || isFixed(n)))
    .reduce((s, n) => s + (n.budget ?? 0), 0);

export const fixedCount = (notes: Note[]) => notes.filter(isMemo).filter(isFixed).length;

/** "Day 1" is the first day of the trip */
export const dayNumber = (days: { date: Temporal.PlainDate }[], date: Temporal.PlainDate) =>
  days.findIndex((d) => d.date.equals(date)) + 1;

/**
 * The days a flight leaves and lands on, as its times say; with no times yet, the way there is
 * on the trip's first day and the way home on its last
 */
export function flightDays(
  f: Flight,
  leg: Leg,
  days: { date: Temporal.PlainDate }[],
): Temporal.PlainDate[] {
  const known = [f.departs, f.arrives].flatMap((t) => (t === null ? [] : [t.toPlainDate()]));
  if (known.length > 0) return known;
  const day = leg === "out" ? days[0]?.date : days.at(-1)?.date;
  return day === undefined ? [] : [day];
}

/** The night after its last: the day it is left */
export const checkOut = (s: Stay) => s.checkIn.add({ days: s.nights });

/** Where the night of `date` is spent, if the trip says */
export const stayOn = (stays: Stay[], date: Temporal.PlainDate) =>
  stays.find(
    (s) =>
      Temporal.PlainDate.compare(s.checkIn, date) <= 0 &&
      Temporal.PlainDate.compare(date, checkOut(s)) < 0,
  );

/** Where `date` begins: the night before's stay */
export const wakeAt = (stays: Stay[], date: Temporal.PlainDate) =>
  stayOn(stays, date.subtract({ days: 1 }));

/** Put a memo on a day (keeping its time and status), or take it off the itinerary */
export const assignTo = (n: Memo, date: Temporal.PlainDate | null): MemoPatch => ({
  schedule:
    date === null
      ? null
      : { date, time: n.schedule?.time ?? null, status: n.schedule?.status ?? "idea" },
});

/** Adopting a draft confirms every item it gave a time */
export const draftUpdates = (draft: DayDraft) =>
  draft.items.flatMap(({ note, time }) =>
    time !== null
      ? [
          {
            id: note.id,
            patch: { schedule: { ...note.schedule, time, status: "fixed" } } satisfies MemoPatch,
          },
        ]
      : [],
  );
