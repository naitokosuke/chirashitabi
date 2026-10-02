import { Temporal } from "temporal-polyfill-lite";

import { ref } from "vue";

import { defineStore } from "pinia";

import type { MemberId } from "../members/types";
import { useMembers } from "../members/useMembers";
import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

import { adopted, duplicateInput } from "./input";
import type { Memo, MemoPatch, Note, NoteColor, NoteId, NoteInput } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10) as NoteId;
const now = () => Temporal.Now.instant();

export const useNotes = defineStore("notes", () => {
  const sync = useSync();
  const members = useMembers();
  // Deep ref on purpose: cards read x/y through the array, so moving one card
  // only touches that object. shallowRef would skip those nested updates.
  const notes = ref<Note[]>([]);

  // ---- mutations (local first, then sync) ----
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
      ...input,
    };
    notes.value.push(n);
    sync.send({ type: "note:add", note: n });
    return n;
  }
  /** Only memos have fields to edit; a suggestion is adopted first */
  function update(id: NoteId, patch: MemoPatch) {
    const n = byId(id);
    if (n?.kind !== "memo") return;
    Object.assign(n, patch, { updatedAt: now() });
    sync.send({ type: "note:update", id, patch });
  }
  /** Any card can change color, suggestions included */
  function recolor(id: NoteId, color: NoteColor) {
    const n = byId(id);
    if (n === undefined) return;
    n.color = color;
    n.updatedAt = now();
    sync.send({ type: "note:recolor", id, color });
  }
  function move(id: NoteId, x: number, y: number, final = false) {
    const n = byId(id);
    if (n === undefined) return;
    n.x = x;
    n.y = y;
    if (final) n.updatedAt = now();
    sync.send({ type: "note:move", id, x, y });
  }
  function remove(id: NoteId) {
    const i = notes.value.findIndex((n) => n.id === id);
    if (i >= 0) notes.value.splice(i, 1);
    sync.send({ type: "note:delete", id });
  }
  function duplicate(id: NoteId) {
    const n = byId(id);
    if (n === undefined) return;
    return add(duplicateInput(n), { x: n.x + 24, y: n.y + 24 });
  }
  /** A suggestion becomes an ordinary memo; `by` still says whose idea it was */
  function adopt(id: NoteId) {
    const i = notes.value.findIndex((n) => n.id === id);
    const n = notes.value[i];
    if (n?.kind !== "suggestion") return;
    notes.value[i] = { ...adopted(n), updatedAt: now() };
    sync.send({ type: "note:adopt", id });
  }
  const byId = (id: NoteId) => notes.value.find((n) => n.id === id);

  /** Called by the room when an authoritative snapshot arrives. */
  function apply(snapshot: Note[]) {
    notes.value = snapshot;
  }

  /** A note mutation the room relays from a member (us too, after a reconnect): applied, never sent */
  function receive(m: Mutation, by: MemberId, at: Temporal.Instant) {
    switch (m.type) {
      case "note:add":
        if (byId(m.note.id) === undefined) notes.value.push({ ...m.note, by, updatedAt: at });
        return;
      case "note:update": {
        const n = byId(m.id);
        if (n?.kind === "memo") Object.assign(n, m.patch, { updatedAt: at });
        return;
      }
      case "note:recolor": {
        const n = byId(m.id);
        if (n !== undefined) Object.assign(n, { color: m.color, updatedAt: at });
        return;
      }
      case "note:move": {
        const n = byId(m.id);
        if (n !== undefined) Object.assign(n, { x: m.x, y: m.y, updatedAt: at });
        return;
      }
      case "note:delete": {
        const i = notes.value.findIndex((n) => n.id === m.id);
        if (i >= 0) notes.value.splice(i, 1);
        return;
      }
      case "note:adopt": {
        const i = notes.value.findIndex((n) => n.id === m.id);
        const n = notes.value[i];
        if (n?.kind === "suggestion") notes.value[i] = { ...adopted(n), updatedAt: at };
        return;
      }
      default:
        return; // not a note's
    }
  }

  return { notes, add, update, recolor, move, remove, duplicate, adopt, byId, apply, receive };
});
