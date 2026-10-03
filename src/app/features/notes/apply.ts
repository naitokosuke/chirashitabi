import type { Temporal } from "temporal-polyfill-lite";

import type { MemberId } from "../members/types";
import type { Mutation } from "../sync/types";

import { adopted } from "./input";
import type { Note } from "./types";

/**
 * The notes after a mutation, whoever made it: the only place that knows what a note
 * mutation means (docs/data-fetching.md). Never changes `notes` or a note in place; a note
 * that changes is a new object, and a mutation that changes nothing returns `notes` itself.
 * `by` and `at` stamp what the room would stamp: the author of a new note, and `updatedAt`.
 */
export function applyToNotes(
  notes: Note[],
  m: Mutation,
  by: MemberId,
  at: Temporal.Instant,
): Note[] {
  const edit = (id: string, change: (n: Note) => Note | null): Note[] => {
    const i = notes.findIndex((n) => n.id === id);
    const old = notes[i];
    const next = old === undefined ? null : change(old);
    return next === null ? notes : notes.map((n, j) => (j === i ? next : n));
  };
  switch (m.type) {
    case "note:add":
      // a note that is already here (a replay after a reconnect) is not added twice
      return notes.some((n) => n.id === m.note.id)
        ? notes
        : [...notes, { ...m.note, by, updatedAt: at }];
    case "note:update":
      return edit(m.id, (n) => (n.kind === "memo" ? { ...n, ...m.patch, updatedAt: at } : null));
    case "note:recolor":
      return edit(m.id, (n) => ({ ...n, color: m.color, updatedAt: at }));
    case "note:move":
      return edit(m.id, (n) => ({
        ...n,
        x: m.x,
        y: m.y,
        rot: m.rot ?? n.rot,
        scale: m.scale ?? n.scale,
        updatedAt: at,
      }));
    case "note:adopt":
      return edit(m.id, (n) => (n.kind === "suggestion" ? { ...adopted(n), updatedAt: at } : null));
    case "note:delete":
      return notes.some((n) => n.id === m.id) ? notes.filter((n) => n.id !== m.id) : notes;
    default:
      return notes; // not a note's
  }
}
