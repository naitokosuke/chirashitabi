import { Temporal } from "temporal-polyfill-lite";

/** A stretch of days, both ends in it; `end` is null while the last day is still to be picked */
export interface DateRange {
  start: Temporal.PlainDate;
  end: Temporal.PlainDate | null;
}

/**
 * The weeks from Sunday that hold the month's days, whole, so the first and the last run
 * into the months either side: what the calendar draws, row by row
 */
export function weeksOf(
  month: Temporal.PlainYearMonth,
): [Temporal.PlainDate, ...Temporal.PlainDate[]][] {
  const first = month.toPlainDate({ day: 1 });
  const before = first.dayOfWeek % 7;
  const sunday = first.subtract({ days: before });
  return Array.from({ length: Math.ceil((before + month.daysInMonth) / 7) }, (_, w) => {
    // a row starts on its Sunday, so it is never empty
    const start = sunday.add({ days: w * 7 });
    return [start, ...Array.from({ length: 6 }, (_, d) => start.add({ days: d + 1 }))];
  });
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
