import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { MemberId } from "../members/types";

import { applyToNotes } from "./apply";
import type { Memo, Note, NoteId, Suggestion } from "./types";

const YUKI = "yuki" as MemberId;
const KEN = "ken" as MemberId;
const t0 = Temporal.Instant.from("2026-10-01T00:00:00Z");
const t1 = Temporal.Instant.from("2026-10-01T00:01:00Z");

const memo = (id: string, extra: Partial<Memo> = {}): Memo => ({
  id: id as NoteId,
  kind: "memo",
  title: id,
  color: "#fff1b8",
  x: 0,
  y: 0,
  rot: 0,
  scale: 1,
  by: YUKI,
  updatedAt: t0,
  body: "",
  tags: [],
  mapsUrl: null,
  pin: null,
  schedule: null,
  budget: null,
  checked: false,
  image: null,
  ...extra,
});
const suggestion = (id: string): Suggestion => ({
  id: id as NoteId,
  kind: "suggestion",
  title: id,
  color: "#ffffff",
  x: 0,
  y: 0,
  rot: 0,
  scale: 1,
  by: KEN,
  updatedAt: t0,
});

/** Applies and checks the old array and its notes were not touched */
function apply(
  notes: Note[],
  ...args: Parameters<typeof applyToNotes> extends [unknown, ...infer R] ? R : never
) {
  const before = structuredClone(notes.map((n) => ({ ...n, updatedAt: n.updatedAt.toString() })));
  const after = applyToNotes(notes, ...args);
  expect(notes.map((n) => ({ ...n, updatedAt: n.updatedAt.toString() }))).toEqual(before);
  return after;
}

describe("applyToNotes", () => {
  test("adds a note stamped with its author and time", () => {
    const next = apply([memo("a")], { type: "note:add", note: memo("b", { by: YUKI }) }, KEN, t1);
    expect(next.map((n) => n.id)).toEqual(["a", "b"]);
    expect(next[1]).toMatchObject({ by: KEN, updatedAt: t1 });
  });

  test("a note that is already here is not added twice, and the array is kept", () => {
    const notes = [memo("a")];
    expect(apply(notes, { type: "note:add", note: memo("a") }, KEN, t1)).toBe(notes);
  });

  test("an update makes a new note and keeps the others as they were", () => {
    const notes = [memo("a"), memo("b")];
    const next = apply(
      notes,
      { type: "note:update", id: "b" as NoteId, patch: { title: "B" } },
      YUKI,
      t1,
    );
    expect(next[0]).toBe(notes[0]);
    expect(next[1]).not.toBe(notes[1]);
    expect(next[1]).toMatchObject({ title: "B", updatedAt: t1 });
  });

  test("a suggestion takes no update; nothing changes", () => {
    const notes = [suggestion("s")];
    expect(
      apply(notes, { type: "note:update", id: "s" as NoteId, patch: { title: "x" } }, YUKI, t1),
    ).toBe(notes);
  });

  test("recolor and move apply to any card", () => {
    const notes = [suggestion("s")];
    const recolored = apply(
      notes,
      { type: "note:recolor", id: "s" as NoteId, color: "#ffd9de" },
      YUKI,
      t1,
    );
    expect(recolored[0]?.color).toBe("#ffd9de");
    const moved = apply(
      recolored,
      { type: "note:move", id: "s" as NoteId, x: 10, y: 20 },
      YUKI,
      t1,
    );
    expect(moved[0]).toMatchObject({ x: 10, y: 20 });
  });

  test("adopting turns a suggestion into a plain memo, still by whoever suggested it", () => {
    const next = apply([suggestion("s")], { type: "note:adopt", id: "s" as NoteId }, YUKI, t1);
    expect(next[0]).toMatchObject({ kind: "memo", by: KEN, color: "#ffffff", updatedAt: t1 });
  });

  test("delete removes the note; deleting what is not there keeps the array", () => {
    const notes = [memo("a"), memo("b")];
    expect(
      apply(notes, { type: "note:delete", id: "a" as NoteId }, YUKI, t1).map((n) => n.id),
    ).toEqual(["b"]);
    expect(apply(notes, { type: "note:delete", id: "z" as NoteId }, YUKI, t1)).toBe(notes);
  });

  test("a mutation that is not a note's keeps the array", () => {
    const notes = [memo("a")];
    expect(
      apply(notes, { type: "member:profile", name: "Ken", color: "#000000" as never }, KEN, t1),
    ).toBe(notes);
  });
});
