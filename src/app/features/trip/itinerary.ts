import { Temporal } from "temporal-polyfill-lite";

import {
  PACKING_TAG,
  TODO_TAG,
  type Memo,
  type MemoPatch,
  type Note,
  type NoteStatus,
  type Schedule,
  type Scheduled,
  type Tag,
} from "../notes/types";
import type { DayDraft } from "../worker/types";

import type { Flight, Leg, Stay } from "./types";

const NEXT_STATUS: Record<NoteStatus, NoteStatus> = { idea: "fixed", fixed: "done", done: "idea" };
/** Maybe -> Confirmed -> Done -> Maybe */
export const cycleStatus = (s: Schedule): Schedule => ({ ...s, status: NEXT_STATUS[s.status] });

const isMemo = (n: Note) => n.kind === "memo";
/** A memo on a day as one, for a flatMap: built with its schedule, so its type is checked, not claimed */
const scheduled = (n: Note): Scheduled[] =>
  n.kind === "memo" && n.schedule !== null ? [{ ...n, schedule: n.schedule }] : [];
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

/** Memos still waiting for a day (packing notes and to-dos never need one) */
export const unassigned = (notes: Note[]) =>
  notes
    .filter(isMemo)
    .filter(
      (n) => n.schedule === null && !n.tags.includes(PACKING_TAG) && !n.tags.includes(TODO_TAG),
    );

/** A day's memos in time order, optionally only those with `status` */
export const forDay = (notes: Note[], date: Temporal.PlainDate, status?: NoteStatus) =>
  notes
    .flatMap(scheduled)
    .filter(
      (n) => n.schedule.date.equals(date) && (status === undefined || n.schedule.status === status),
    )
    .sort(byTime);

export const byTag = (notes: Note[], tag: Tag) =>
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

const minuteOfDay = (t: Temporal.PlainTime) => t.hour * 60 + t.minute;

/** When a memo on a day ends, while it says both when it starts and how long it takes */
export const endOf = (n: Scheduled): Temporal.PlainTime | null =>
  n.schedule.time === null || n.minutes === null
    ? null
    : n.schedule.time.add({ minutes: n.minutes });

/** Why a memo cannot start when it says: it overlaps the one before, or the way there is longer than the gap */
export type Timing =
  | { kind: "overlap"; minutes: number }
  | { kind: "tight"; gap: number; way: number };
/**
 * Whether `next` can start when it says after `prev`, with `way` minutes between their places
 * (0 when that is not known); null when it can, or when either does not say enough to tell
 */
export function timing(prev: Scheduled, next: Scheduled, way: number): Timing | null {
  const [start, then] = [prev.schedule.time, next.schedule.time];
  if (start === null || then === null || prev.minutes === null) return null;
  const gap = minuteOfDay(then) - (minuteOfDay(start) + prev.minutes);
  if (gap < 0) return { kind: "overlap", minutes: -gap };
  return gap < way ? { kind: "tight", gap, way } : null;
}

/** Put a memo on a day (keeping its time and status), or take it off the itinerary */
export const assignTo = (n: Memo, date: Temporal.PlainDate | null): MemoPatch => ({
  schedule:
    date === null
      ? null
      : { date, time: n.schedule?.time ?? null, status: n.schedule?.status ?? "idea" },
});

/**
 * Adopting a draft confirms every item it gave a time, and gives how long it takes to each that
 * did not say (one the travellers set stays theirs). Each item is read from `day`, the memos on
 * the draft's day as they are now: one changed since the ask keeps that change, and one taken off
 * the day (or gone) meanwhile is left alone.
 */
export const draftUpdates = (draft: DayDraft, day: Scheduled[]) =>
  draft.items.flatMap(({ note: asked, time, minutes }) => {
    const note = day.find((n) => n.id === asked.id);
    if (note === undefined) return [];
    const patch: MemoPatch = {
      ...(time === null ? {} : { schedule: { ...note.schedule, time, status: "fixed" } }),
      ...(note.minutes === null && minutes !== null ? { minutes } : {}),
    };
    return Object.keys(patch).length === 0 ? [] : [{ id: note.id, patch }];
  });
