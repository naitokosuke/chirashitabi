/**
 * Opening hours as OpenStreetMap writes them (its `opening_hours` tag, which a person can write
 * too), read for the booklet: the common part of the syntax (weekdays, times, `off`, `24/7`),
 * so it can say when a place is open on a day and warn when a plan falls while it is shut.
 * Anything past that part (months, a holiday's own hours, sunrise, comments) leaves the whole
 * value unread: the booklet shows it as written and warns about nothing.
 */

/** Minutes from the day's midnight; an end may run past 24:00 into the next day */
export interface Span {
  from: number;
  to: number;
}

/** Each weekday's spans, Monday first; a day with none is closed */
export type Week = Span[][];

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY = 24 * 60;
const ALL_DAY: Span[] = [{ from: 0, to: DAY }];
/** Holidays name no weekday: a rule only for them changes none */
const HOLIDAYS = new Set(["PH", "SH"]);

/** "09:30" as minutes from midnight, "24:00" the day's end; null for what is no time */
function minuteOf(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m === null) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (min >= 60 || h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** "Mo-Fr,Su" as the weekdays it names (0 Monday), a range wrapping past Sunday; null when unread */
function daysOf(selector: string): number[] | null {
  const days: number[] = [];
  for (const part of selector.split(",")) {
    if (HOLIDAYS.has(part)) continue;
    const [a, b, ...rest] = part.split("-");
    const from = DAYS.indexOf(a ?? "");
    const to = b === undefined ? from : DAYS.indexOf(b);
    if (from < 0 || to < 0 || rest.length > 0) return null;
    for (let d = from; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === to) break;
    }
  }
  return days;
}

/** "09:00-12:00,13:00-02:00" as spans, one ending before it starts running past midnight; "off" is none */
function spansOf(times: string): Span[] | null {
  if (times === "off" || times === "closed") return [];
  const spans: Span[] = [];
  for (const part of times.split(",")) {
    const [a, b, ...rest] = part.split("-");
    // an open end ("18:00+") is open until midnight, as far as a plan can tell
    const from = minuteOf(a?.replace(/\+$/, "") ?? "");
    const to = a?.endsWith("+") === true && b === undefined ? DAY : minuteOf(b ?? "");
    if (from === null || to === null || rest.length > 0 || from === to) return null;
    spans.push({ from, to: to < from ? to + DAY : to });
  }
  return spans;
}

/** The week the value says, later rules overriding earlier ones for the days they name; null when unread */
export function readHours(value: string): Week | null {
  const rules = value
    .split(/;|\|\|/)
    .map((r) => r.trim().replace(/\s*,\s*/g, ","))
    .filter((r) => r !== "");
  if (rules.length === 0) return null;
  const week: Week = DAYS.map(() => []);
  for (const rule of rules) {
    if (rule === "24/7") {
      week.fill(ALL_DAY);
      continue;
    }
    // a rule names its weekdays first, or none and holds for every day
    const [head = "", ...tail] = rule.split(/\s+/);
    const bare = /^\d/.test(head) || head === "off" || head === "closed";
    const days = bare ? [0, 1, 2, 3, 4, 5, 6] : daysOf(head);
    const spans = spansOf(bare ? rule.replace(/\s+/g, "") : tail.join(""));
    if (days === null || spans === null) return null;
    for (const d of days) week[d] = spans;
  }
  return week;
}

/** When it is open on weekday `day` (0 Monday): its own spans, after what the night before ran past midnight */
export function openOn(week: Week, day: number): Span[] {
  const before = (week[(day + 6) % 7] ?? [])
    .filter((s) => s.to > DAY)
    .map((s) => ({ from: 0, to: s.to - DAY }));
  return [...before, ...(week[day] ?? [])];
}

/**
 * How a plan from `start` (minutes from midnight; null: any time) for `minutes` (null: not
 * said) sits in the hours of weekday `day`: open, the place closed that day, shut at that time,
 * or closing (at `at`, minutes from midnight) before the plan ends
 */
export type Fit =
  | { kind: "open" }
  | { kind: "closed" }
  | { kind: "shut" }
  | { kind: "closes"; at: number };
export function fitHours(
  week: Week,
  day: number,
  start: number | null,
  minutes: number | null,
): Fit {
  const spans = openOn(week, day);
  if (spans.length === 0) return { kind: "closed" };
  if (start === null) return { kind: "open" };
  const span = spans.find((s) => s.from <= start && start < s.to);
  if (span === undefined) return { kind: "shut" };
  return minutes !== null && start + minutes > span.to
    ? { kind: "closes", at: span.to % DAY }
    : { kind: "open" };
}

/** Minutes from midnight as a clock reads them, "02:00" for one past midnight */
export const clockText = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** A day's spans as they read, "11:00–14:30, 17:00–02:00"; "" when it is closed */
export const spansText = (spans: Span[]) =>
  spans.map((s) => `${clockText(s.from)}–${s.to === DAY ? "24:00" : clockText(s.to)}`).join(", ");
