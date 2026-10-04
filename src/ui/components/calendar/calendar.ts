import { Temporal } from "temporal-polyfill-lite";

/** A stretch of days, both ends in it; `end` is null while the last day is still to be picked */
export interface DateRange {
  start: Temporal.PlainDate;
  end: Temporal.PlainDate | null;
}

/**
 * The month's days in weeks from Sunday, a null where a week runs into the month before or
 * after: what the calendar draws, row by row
 */
export function weeksOf(month: Temporal.PlainYearMonth): (Temporal.PlainDate | null)[][] {
  const first = month.toPlainDate({ day: 1 });
  const cells: (Temporal.PlainDate | null)[] = [
    ...Array.from({ length: first.dayOfWeek % 7 }, () => null),
    ...Array.from({ length: month.daysInMonth }, (_, i) => first.add({ days: i })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/**
 * The range after `day` is picked: the last day once a first one waits for it, else a new
 * first day. A day before the first, or past `maxDays` from it, starts over from that day
 */
export function pick(range: DateRange, day: Temporal.PlainDate, maxDays: number): DateRange {
  const { start, end } = range;
  if (end !== null || Temporal.PlainDate.compare(day, start) < 0) return { start: day, end: null };
  if (start.until(day).days >= maxDays) return { start: day, end: null };
  return { start, end: day };
}

/** How many days the range holds, both ends counted; null while it has no last day */
export const lengthOf = (range: DateRange) =>
  range.end === null ? null : range.start.until(range.end).days + 1;
