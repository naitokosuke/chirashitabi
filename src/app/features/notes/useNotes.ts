import { defineStore } from "pinia";
import { ref } from "vue";
import { Temporal } from "temporal-polyfill-lite";
import { useMembers } from "@/features/members/useMembers";
import { useSync } from "@/features/sync/useSync";
import { adopted, duplicateInput } from "./input";
import type { Memo, MemoPatch, Note, NoteInput } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);
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
  function update(id: string, patch: MemoPatch) {
    const n = byId(id);
    if (n?.kind !== "memo") return;
    Object.assign(n, patch, { updatedAt: now() });
    sync.send({ type: "note:update", id, patch });
  }
  /** Any card can change color, suggestions included */
  function recolor(id: string, color: string) {
    const n = byId(id);
    if (!n) return;
    n.color = color;
    n.updatedAt = now();
    sync.send({ type: "note:recolor", id, color });
  }
  function move(id: string, x: number, y: number, final = false) {
    const n = byId(id);
    if (!n) return;
    n.x = x;
    n.y = y;
    if (final) n.updatedAt = now();
    sync.send({ type: "note:move", id, x, y });
  }
  function remove(id: string) {
    const i = notes.value.findIndex((n) => n.id === id);
    if (i >= 0) notes.value.splice(i, 1);
    sync.send({ type: "note:delete", id });
  }
  function duplicate(id: string) {
    const n = byId(id);
    if (!n) return;
    return add(duplicateInput(n), { x: n.x + 24, y: n.y + 24 });
  }
  /** A suggestion becomes an ordinary memo; `by` still says whose idea it was */
  function adopt(id: string) {
    const i = notes.value.findIndex((n) => n.id === id);
    const n = notes.value[i];
    if (n?.kind !== "suggestion") return;
    notes.value[i] = { ...adopted(n), updatedAt: now() };
    sync.send({ type: "note:adopt", id });
  }
  const byId = (id: string) => notes.value.find((n) => n.id === id);

  /** Called by the room when an authoritative snapshot arrives. */
  function apply(snapshot: Note[]) {
    notes.value = snapshot;
  }

  return { notes, add, update, recolor, move, remove, duplicate, adopt, byId, apply };
});
