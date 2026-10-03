import { Temporal } from "temporal-polyfill-lite";

import { shallowRef } from "vue";

import { defineStore } from "pinia";

import type { MemberId } from "../members/types";
import { useMembers } from "../members/useMembers";
import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

import { applyToNotes } from "./apply";
import { duplicateInput } from "./input";
import type { Memo, MemoPatch, Note, NoteColor, NoteId, NoteInput } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10) as NoteId;
const now = () => Temporal.Now.instant();

/**
 * The room's notes. Every change, ours or a member's, goes through `applyToNotes`, which
 * returns a new array with new objects for what changed; the store only assigns the result
 * (docs/data-fetching.md). Hold a note by its id, not by the object: the object is replaced
 * whenever the note changes.
 */
export const useNotes = defineStore("notes", () => {
  const sync = useSync();
  const members = useMembers();
  const notes = shallowRef<Note[]>([]);

  /** Ours: applied here at once, then sent */
  function commit(m: Mutation) {
    notes.value = applyToNotes(notes.value, m, members.me, now());
    sync.send(m);
  }

  function add(input: NoteInput, at: { x: number; y: number }): Memo {
    const n: Memo = {
      id: uid(),
      kind: "memo",
      by: members.me,
      updatedAt: now(),
      x: at.x + (Math.random() * 20 - 10),
      y: at.y + (Math.random() * 20 - 10),
      rot: Math.random() * 4 - 2,
      schedule: null,
      budget: null,
      checked: false,
      ...input,
    };
    commit({ type: "note:add", note: n });
    return n;
  }
  /** Only memos have fields to edit; a suggestion is adopted first */
  function update(id: NoteId, patch: MemoPatch) {
    if (byId(id)?.kind !== "memo") return;
    commit({ type: "note:update", id, patch });
  }
  /** Any card can change color, suggestions included */
  function recolor(id: NoteId, color: NoteColor) {
    if (byId(id) === undefined) return;
    commit({ type: "note:recolor", id, color });
  }
  function move(id: NoteId, x: number, y: number) {
    if (byId(id) === undefined) return;
    commit({ type: "note:move", id, x, y });
  }
  /** A card under a finger, every frame: moved here only; `move` is what sends it, a few times a second */
  function nudge(id: NoteId, x: number, y: number) {
    notes.value = applyToNotes(notes.value, { type: "note:move", id, x, y }, members.me, now());
  }
  function remove(id: NoteId) {
    commit({ type: "note:delete", id });
  }
  function duplicate(id: NoteId) {
    const n = byId(id);
    if (n === undefined) return;
    return add(duplicateInput(n), { x: n.x + 24, y: n.y + 24 });
  }
  /** A suggestion becomes an ordinary memo; `by` still says whose idea it was */
  function adopt(id: NoteId) {
    if (byId(id)?.kind !== "suggestion") return;
    commit({ type: "note:adopt", id });
  }
  const byId = (id: NoteId) => notes.value.find((n) => n.id === id);

  /** Called by the room when an authoritative snapshot arrives. */
  function apply(snapshot: Note[]) {
    notes.value = snapshot;
  }

  /** A note mutation the room relays from a member (us too, after a reconnect): applied, never sent */
  function receive(m: Mutation, by: MemberId, at: Temporal.Instant) {
    notes.value = applyToNotes(notes.value, m, by, at);
  }

  return {
    notes,
    add,
    update,
    recolor,
    move,
    nudge,
    remove,
    duplicate,
    adopt,
    byId,
    apply,
    receive,
  };
});
