import { computed } from "vue";

import { defineStore } from "pinia";

import { useQueryState } from "@pinia/colada";

import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import { duplicateInput } from "./input";
import type { MemoPatch, NewMemo, NoteColor, NoteId, NoteInput } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10) as NoteId;

/**
 * The room's notes, as the query cache holds them (keys.ts), and the
 * changes one can make to them. A change is committed to the room, which shows it at once
 * and keeps it until the room answers (ledger.ts, docs/data-fetching.md). Hold a note by its
 * id, not by the object: the object is replaced whenever the note changes.
 */
export const useNotes = defineStore("notes", () => {
  const sync = useSync();
  const { data } = useQueryState(() => roomKeys.notes(sync.roomId));
  const notes = computed(() => data.value ?? []);

  /** A new memo near `at`; whose it is and when is stamped as it is applied */
  function add(input: NoteInput, at: { x: number; y: number }): NewMemo {
    const n: NewMemo = {
      id: uid(),
      kind: "memo",
      x: at.x + (Math.random() * 20 - 10),
      y: at.y + (Math.random() * 20 - 10),
      rot: Math.random() * 4 - 2,
      schedule: null,
      budget: null,
      checked: false,
      ...input,
    };
    sync.commit({ type: "note:add", note: n });
    return n;
  }
  /** Only memos have fields to edit; a suggestion is adopted first */
  function update(id: NoteId, patch: MemoPatch) {
    if (byId(id)?.kind !== "memo") return;
    sync.commit({ type: "note:update", id, patch });
  }
  /** Any card can change color, suggestions included */
  function recolor(id: NoteId, color: NoteColor) {
    if (byId(id) === undefined) return;
    sync.commit({ type: "note:recolor", id, color });
  }
  function move(id: NoteId, x: number, y: number) {
    if (byId(id) === undefined) return;
    sync.commit({ type: "note:move", id, x, y });
  }
  /**
   * A card on its way under a finger: sent so the partner sees it travel, but not committed,
   * since intermediate positions are not changes to keep; the drop is a `move`.
   */
  function sendMove(id: NoteId, x: number, y: number) {
    sync.send({ type: "note:move", id, x, y });
  }
  function remove(id: NoteId) {
    sync.commit({ type: "note:delete", id });
  }
  function duplicate(id: NoteId) {
    const n = byId(id);
    if (n === undefined) return;
    return add(duplicateInput(n), { x: n.x + 24, y: n.y + 24 });
  }
  /** A suggestion becomes an ordinary memo; `by` still says whose idea it was */
  function adopt(id: NoteId) {
    if (byId(id)?.kind !== "suggestion") return;
    sync.commit({ type: "note:adopt", id });
  }
  const byId = (id: NoteId) => notes.value.find((n) => n.id === id);

  return { notes, add, update, recolor, move, sendMove, remove, duplicate, adopt, byId };
});
