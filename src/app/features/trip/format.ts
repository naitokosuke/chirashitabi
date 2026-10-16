import { Temporal } from "temporal-polyfill-lite";

/** "Tue, 11/3" in en, "11/3(火)" in ja */
export const longDate = (date: Temporal.PlainDate, locale: string) =>
  date.toLocaleString(locale, { month: "numeric", day: "numeric", weekday: "short" });
/** "11/3" */
export const shortDate = (date: Temporal.PlainDate, locale: string) =>
  date.toLocaleString(locale, { month: "numeric", day: "numeric" });
/** "Tue" in en, "火" in ja */
export const weekday = (date: Temporal.PlainDate, locale: string) =>
  date.toLocaleString(locale, { weekday: "short" });
/** "12:30" — for labels and `<input type="time">` values */
export const hhmm = (t: Temporal.PlainTime) => t.toString({ smallestUnit: "minute" });
/** How long `minutes` is, as the message that says it ("1 h 30 min", "1時間30分") and its values */
export function durationMessage(minutes: number) {
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  if (h === 0) return { id: "duration.m", params: { m } } as const;
  return m === 0
    ? ({ id: "duration.h", params: { h } } as const)
    : ({ id: "duration.hm", params: { h, m } } as const);
}
/** The lengths offered for how long a memo takes, in minutes */
const DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];
/** Those, with the memo's own among them (one the agent drafted may be another) */
export const durationChoices = (own: number | null) =>
  own === null || DURATIONS.includes(own) ? DURATIONS : [...DURATIONS, own].sort((a, b) => a - b);
/** The value of an `<input type="time">`; empty means no time */
export const fromHhmm = (value: string) => (value === "" ? null : Temporal.PlainTime.from(value));
