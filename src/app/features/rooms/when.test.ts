import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { RoomId, RoomSummary } from "./types";
import { lastDay, shelve, whenOf } from "./when";

const TODAY = Temporal.PlainDate.from("2026-10-03");
const trip = (name: string, first: string | null, days = 3): RoomSummary => ({
  id: name as RoomId,
  name,
  first: first === null ? null : Temporal.PlainDate.from(first),
  days,
  members: [],
  memos: 0,
  owner: true,
});

describe("whenOf", () => {
  test.each([
    ["2026-11-03", 3, { kind: "ahead", in: 31 }],
    ["2026-10-04", 3, { kind: "ahead", in: 1 }],
    ["2026-10-03", 3, { kind: "during", day: 1 }],
    ["2026-10-01", 3, { kind: "during", day: 3 }],
    ["2026-09-30", 3, { kind: "past" }],
  ] as const)("a trip from %s for %i days", (first, days, when) => {
    expect(whenOf(trip("t", first, days), TODAY)).toEqual(when);
  });

  test("a trip without days is undated", () => {
    expect(whenOf(trip("t", null), TODAY)).toEqual({ kind: "undated" });
    expect(whenOf(trip("t", "2026-11-03", 0), TODAY)).toEqual({ kind: "undated" });
  });
});

test("lastDay", () => {
  expect(lastDay(trip("t", "2026-11-03", 3))?.toString()).toBe("2026-11-05");
  expect(lastDay(trip("t", null))).toBeNull();
});

test("shelve: under way first, then the soonest, undated last; past ones most recent first", () => {
  const { coming, been } = shelve(
    [
      trip("later", "2027-01-10"),
      trip("undated", null),
      trip("old", "2025-05-01"),
      trip("now", "2026-10-02"),
      trip("soon", "2026-10-20"),
      trip("recent", "2026-09-01"),
    ],
    TODAY,
  );
  expect(coming.map((t) => t.name)).toEqual(["now", "soon", "later", "undated"]);
  expect(been.map((t) => t.name)).toEqual(["recent", "old"]);
});
