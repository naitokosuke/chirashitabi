import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { MemberId } from "../members/types";
import type { NoteId } from "../notes/id";
import { PACKING_TAG, TODO_TAG, type Memo } from "../notes/types";

import { isLate, todosOf } from "./list";

const day = (s: string) => Temporal.PlainDate.from(s);

function memo(id: string, extra: Partial<Memo> = {}): Memo {
  return {
    kind: "memo",
    id: id as NoteId,
    title: id,
    color: "#fff1b8",
    x: 0,
    y: 0,
    rot: 0,
    scale: 1,
    by: "m" as MemberId,
    updatedAt: Temporal.Instant.from("2026-10-01T00:00:00Z"),
    body: "",
    tags: [],
    mapsUrl: null,
    pin: null,
    schedule: null,
    budget: null,
    checked: false,
    image: null,
    minutes: null,
    hours: null,
    booking: null,
    due: null,
    assignee: null,
    paid: null,
    ...extra,
  };
}

describe("todosOf", () => {
  test("to-dos and plans still to book, open first, the soonest day first, none after", () => {
    const notes = [
      memo("whenever", { tags: [TODO_TAG] }),
      memo("done", { tags: [TODO_TAG], checked: true, due: day("2026-10-01") }),
      memo("visa", { tags: [TODO_TAG], due: day("2026-10-25") }),
      memo("101", { booking: { state: "needed", by: day("2026-10-20") } }),
      memo("booked", { booking: { state: "booked", code: "", url: null } }),
      memo("packing", { tags: [PACKING_TAG] }),
      memo("cash", { tags: [TODO_TAG], due: day("2026-10-25") }),
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
    memo("late", { tags: [TODO_TAG], due: day("2026-10-15") }),
    memo("due", { tags: [TODO_TAG], due: today }),
    memo("done", { tags: [TODO_TAG], due: day("2026-10-01"), checked: true }),
  ]);

  test("open past its day is late; on the day, or done, is not", () => {
    expect([late, due, done].map((t) => t !== undefined && isLate(t, today))).toEqual([
      true,
      false,
      false,
    ]);
  });
});
