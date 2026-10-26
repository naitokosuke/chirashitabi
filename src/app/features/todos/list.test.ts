import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { makeMemo } from "../notes/fixtures";
import { PACKING_TAG, TODO_TAG } from "../notes/types";

import { isLate, todosOf } from "./list";

const day = (s: string) => Temporal.PlainDate.from(s);

describe("todosOf", () => {
  test("to-dos and plans still to book, open first, the soonest day first, none after", () => {
    const notes = [
      makeMemo("whenever", { tags: [TODO_TAG] }),
      makeMemo("done", { tags: [TODO_TAG], checked: true, due: day("2026-10-01") }),
      makeMemo("visa", { tags: [TODO_TAG], due: day("2026-10-25") }),
      makeMemo("101", { booking: { state: "needed", by: day("2026-10-20") } }),
      makeMemo("booked", { booking: { state: "booked", code: "", url: null } }),
      makeMemo("packing", { tags: [PACKING_TAG] }),
      makeMemo("cash", { tags: [TODO_TAG], due: day("2026-10-25") }),
    ];
    expect(todosOf(notes).map((t) => [t.kind, t.memo.id])).toEqual([
      ["booking", "101"],
      ["task", "visa"],
      ["task", "cash"],
      ["task", "whenever"],
      ["task", "done"],
    ]);
  });
});

describe("isLate", () => {
  const today = day("2026-10-16");
  const [late, due, done] = todosOf([
    makeMemo("late", { tags: [TODO_TAG], due: day("2026-10-15") }),
    makeMemo("due", { tags: [TODO_TAG], due: today }),
    makeMemo("done", { tags: [TODO_TAG], due: day("2026-10-01"), checked: true }),
  ]);

  test("open past its day is late; on the day, or done, is not", () => {
    expect([late, due, done].map((t) => t !== undefined && isLate(t, today))).toEqual([
      true,
      false,
      false,
    ]);
  });
});
