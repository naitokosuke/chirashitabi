import { Temporal } from "temporal-polyfill-lite";

/** "Tue, 11/3" in en, "11/3(火)" in ja */
export const longDate = (date: Temporal.PlainDate, locale: string) =>
  date.toLocaleString(locale, { month: "numeric", day: "numeric", weekday: "short" });
/** "11/3" */
export const shortDate = (date: Temporal.PlainDate, locale: string) =>
  date.toLocaleString(locale, { month: "numeric", day: "numeric" });
/** "12:30" — for labels and `<input type="time">` values */
export const hhmm = (t: Temporal.PlainTime) => t.toString({ smallestUnit: "minute" });
/** The value of an `<input type="time">`; empty means no time */
export const fromHhmm = (value: string) => (value ? Temporal.PlainTime.from(value) : null);
