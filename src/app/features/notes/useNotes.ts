import { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { defineStore } from "pinia";

import { useQueryCache } from "@pinia/colada";

import type { MemberId } from "../members/types";
import { useMembers } from "../members/useMembers";
import { roomKey } from "../sync/keys";
import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

import { applyToNotes } from "./apply";
import { duplicateInput } from "./input";
import type { Memo, MemoPatch, Note, NoteColor, NoteId, NoteInput } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10) as NoteId;
const now = () => Temporal.Now.instant();

/**
 * The room's notes, as they sit in the query cache under `roomKey(room, "notes")`: the store
 * reads them from there and writes them back, and the room's socket writes there too
 * (docs/data-fetching.md). Every change, ours or a member's, goes through `applyToNotes`,
 * which returns a new array with new objects for what changed. Hold a note by its id, not by
 * the object: the object is replaced whenever the note changes.
 */
export const useNotes = defineStore("notes", () => {
  const sync = useSync();
  const members = useMembers();
  const queryCache = useQueryCache();
  const key = computed(() => roomKey(sync.roomId, "notes"));
  const notes = computed(() => queryCache.getQueryData<Note[]>(key.value) ?? []);
  const write = (next: Note[]) => queryCache.setQueryData(key.value, next);

  /** Ours: applied here at once, then sent */
  function commit(m: Mutation) {
    write(applyToNotes(notes.value, m, members.me, now()));
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
  /**
   * A card on its way under a finger: sent so the partner sees it travel, but not written to
   * the cache, where intermediate positions do not belong; the drop is a `move`.
   */
  function sendMove(id: NoteId, x: number, y: number) {
    sync.send({ type: "note:move", id, x, y });
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
    write(snapshot);
  }

  /** A note mutation the room relays from a member (us too, after a reconnect): applied, never sent */
  function receive(m: Mutation, by: MemberId, at: Temporal.Instant) {
    const next = applyToNotes(notes.value, m, by, at);
    if (next !== notes.value) write(next);
  }

  return {
    notes,
    add,
    update,
    recolor,
    move,
    sendMove,
    remove,
    duplicate,
    adopt,
    byId,
    apply,
    receive,
  };
});
