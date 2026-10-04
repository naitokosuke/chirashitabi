import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { lengthOf, pick, weeksOf } from "./calendar";

const d = (s: string) => Temporal.PlainDate.from(s);

describe("weeksOf", () => {
  test("the whole weeks from Sunday that hold the month", () => {
    // November 2026 starts on a Sunday and ends on a Monday
    const weeks = weeksOf(Temporal.PlainYearMonth.from("2026-11"));
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]!.toString()).toBe("2026-11-01");
    expect(weeks[4]!.map((x) => x.toString())).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
  });

  test("a month starting midweek runs back into the one before", () => {
    // October 2026 starts on a Thursday
    const first = weeksOf(Temporal.PlainYearMonth.from("2026-10"))[0]!;
    expect(first.map((x) => x.toString())).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });
});

describe("pick", () => {
  const start = d("2026-11-03");

  test("a first day waiting, the day picked is the last", () => {
    expect(pick({ start, end: null }, d("2026-11-05"), 60)).toEqual({
      start,
      end: d("2026-11-05"),
    });
  });

  test("the first day again makes a day trip", () => {
    expect(pick({ start, end: null }, start, 60)).toEqual({ start, end: start });
  });

  test.each([
    ["the range is whole", { start, end: d("2026-11-05") }, d("2026-11-10")],
    ["the day is before the first", { start, end: null }, d("2026-11-01")],
    ["the range would run past the most days", { start, end: null }, d("2027-01-02")],
  ])("starts over from the day picked when %s", (_, range, day) => {
    expect(pick(range, day, 60)).toEqual({ start: day, end: null });
  });

  test("the most days, and no more, fit", () => {
    expect(pick({ start, end: null }, start.add({ days: 59 }), 60).end).not.toBeNull();
  });
});

test("lengthOf counts both ends", () => {
  expect(lengthOf({ start: d("2026-11-30"), end: d("2026-12-02") })).toBe(3);
  expect(lengthOf({ start: d("2026-11-30"), end: null })).toBeNull();
});
