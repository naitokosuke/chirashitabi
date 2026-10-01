import { Temporal } from "temporal-polyfill-lite";

/** "Tue, 11/3" */
export const longDate = (date: Temporal.PlainDate) =>
  date.toLocaleString("en-US", { month: "numeric", day: "numeric", weekday: "short" });
/** "11/3" */
export const shortDate = (date: Temporal.PlainDate) =>
  date.toLocaleString("en-US", { month: "numeric", day: "numeric" });
/** "12:30" — for labels and `<input type="time">` values */
export const hhmm = (t: Temporal.PlainTime) => t.toString({ smallestUnit: "minute" });
/** "NT$1,500" for TWD, "¥1,500" for JPY */
export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
/** The value of an `<input type="time">`; empty means no time */
export const fromHhmm = (value: string) => (value ? Temporal.PlainTime.from(value) : undefined);
