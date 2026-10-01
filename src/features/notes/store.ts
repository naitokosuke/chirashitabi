import { defineStore } from "pinia";
import { ref } from "vue";
import { Temporal } from "temporal-polyfill-lite";
import { useSync } from "@/features/sync/store";
import type { Member, Note, NoteInput } from "./types";
import { seed } from "./seed";

const ME: Member = "yuki";
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => Temporal.Now.instant();

export const useNotes = defineStore("notes", () => {
  const sync = useSync();
  // Deep ref on purpose: cards read x/y through the array, so moving one card
  // only touches that object. shallowRef would skip those nested updates.
  const notes = ref<Note[]>(seed());

  // ---- mutations (local first, then sync) ----
  function add(input: NoteInput, at: { x: number; y: number }): Note {
    const n: Note = {
      id: uid(),
      kind: "note",
      by: ME,
      updatedAt: now(),
      x: at.x + (Math.random() * 20 - 10),
      y: at.y + (Math.random() * 20 - 10),
      rot: Math.random() * 4 - 2,
      ...input,
    };
    notes.value.push(n);
    sync.send({ type: "note:add", note: n });
    return n;
  }
  function update(id: string, patch: Partial<Note>) {
    const n = byId(id);
    if (!n) return;
    Object.assign(n, patch, { updatedAt: now() });
    sync.send({ type: "note:update", id, patch });
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
    return add(
      { title: n.title, body: n.body, tags: [...n.tags], color: n.color },
      { x: n.x + 24, y: n.y + 24 },
    );
  }
  function adopt(id: string) {
    update(id, { kind: "note", color: "#ffffff", tags: ["Claude"] });
  }
  const byId = (id: string) => notes.value.find((n) => n.id === id);

  /** Called by the room when an authoritative snapshot arrives. */
  function apply(snapshot: Note[]) {
    notes.value = snapshot;
  }

  return { notes, add, update, move, remove, duplicate, adopt, byId, apply };
});
