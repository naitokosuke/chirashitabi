import type { Temporal } from "temporal-polyfill-lite";

/** "Tue, 11/3" */
export const longDate = (date: Temporal.PlainDate) =>
  date.toLocaleString("en-US", { month: "numeric", day: "numeric", weekday: "short" });
/** "11/3" */
export const shortDate = (date: Temporal.PlainDate) =>
  date.toLocaleString("en-US", { month: "numeric", day: "numeric" });
/** "12:30" — for labels and `<input type="time">` values */
export const hhmm = (t: Temporal.PlainTime) => t.toString({ smallestUnit: "minute" });
/** "NT$ 1,500" */
export const ntd = (n: number) => "NT$ " + n.toLocaleString("en-US");
