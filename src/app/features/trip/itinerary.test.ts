import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { MemberId } from "../members/types";
import type { Memo, NoteId, NoteStatus } from "../notes/types";

import { forDay } from "./itinerary";

const day = Temporal.PlainDate.from("2026-11-03");

function memo(id: string, time: string | null, status: NoteStatus, editedAt: string): Memo {
  return {
    kind: "memo",
    id: id as NoteId,
    title: id,
    color: "#fff1b8",
    x: 0,
    y: 0,
    rot: 0,
    by: "m" as MemberId,
    updatedAt: Temporal.Instant.from(editedAt),
    body: "",
    tags: [],
    mapsUrl: null,
    pin: null,
    schedule: { date: day, time: time === null ? null : Temporal.PlainTime.from(time), status },
    budget: null,
    checked: false,
  };
}

const ids = (notes: Memo[]) => notes.map((n) => n.id);

describe("forDay", () => {
  test("orders by time, untimed last", () => {
    const notes = [
      memo("anytime", null, "idea", "2026-10-01T00:00:00Z"),
      memo("dinner", "19:00", "idea", "2026-10-01T00:00:00Z"),
      memo("lunch", "12:00", "idea", "2026-10-01T00:00:00Z"),
    ];
    expect(ids(forDay(notes, day))).toEqual(["lunch", "dinner", "anytime"]);
  });

  test("a later edit does not move a card past others at the same time", () => {
    // "first" was written first but edited (e.g. its status tapped) last
    const notes = [
      memo("first", "12:00", "done", "2026-10-02T00:00:00Z"),
      memo("second", "12:00", "idea", "2026-10-01T00:00:00Z"),
      memo("loose-a", null, "fixed", "2026-10-02T00:00:00Z"),
      memo("loose-b", null, "idea", "2026-10-01T00:00:00Z"),
    ];
    expect(ids(forDay(notes, day))).toEqual(["first", "second", "loose-a", "loose-b"]);
  });
});
