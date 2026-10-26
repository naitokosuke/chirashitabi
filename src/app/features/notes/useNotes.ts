import { computed, shallowRef } from "vue";

import { defineQuery, useQueryState } from "@pinia/colada";
import * as v from "valibot";

import type { RoomId } from "../rooms/types";
import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import { NoteIdSchema, type ImageId, type NoteId } from "./id";
import { duplicateInput } from "./input";
import type { MemoPatch, NewMemo, NewSticker, NewText, NoteInput, Shape } from "./types";

const uid = () => v.parse(NoteIdSchema, Math.random().toString(36).slice(2, 10));

/**
 * The room's notes, as the query cache holds them (keys.ts), and the
 * changes one can make to them. A change is committed to the room, which shows it at once
 * and keeps it until the room answers (ledger.ts, docs/data-fetching.md). Hold a note by its
 * id, not by the object: the object is replaced whenever the note changes. The notes are
 * undefined until the room's first snapshot. A card deleted with a moment to take it back
 * (`removeLater`) is left out of them on every tab until that moment is over. Defined once for
 * the app (defineQuery).
 */
export const useNotes = defineQuery(() => {
  const sync = useSync();
  const { data: cached } = useQueryState(() => roomKeys.notes(sync.room));
  /**
   * Cards deleted here that the room has not heard of yet, each room's own: one deleted in a
   * room is hidden in that room only, and only that room is ever told
   */
  const leaving = shallowRef<ReadonlyMap<RoomId, ReadonlySet<NoteId>>>(new Map());
  const notes = computed(() => {
    const gone = sync.room === null ? undefined : leaving.value.get(sync.room);
    return gone === undefined ? cached.value : cached.value?.filter((n) => !gone.has(n.id));
  });
  const byId = (id: NoteId) => notes.value?.find((n) => n.id === id);

  /** A new memo near `at`; whose it is and when is stamped as it is applied */
  function add(input: NoteInput, at: { x: number; y: number }): NewMemo {
    const n: NewMemo = {
      id: uid(),
      kind: "memo",
      x: at.x + (Math.random() * 20 - 10),
      y: at.y + (Math.random() * 20 - 10),
      rot: Math.random() * 4 - 2,
      scale: 1,
      schedule: null,
      budget: null,
      checked: false,
      ...input,
    };
    sync.commit({ type: "note:add", note: n });
    return n;
  }
  /**
   * A text box saying `text` with its top-left at `at`, level and its own size; nothing is
   * made for blank text
   */
  function addText(text: string, at: { x: number; y: number }, shape = { rot: 0, scale: 1 }) {
    const t = text.trim();
    if (t === "") return;
    const n: NewText = { id: uid(), kind: "text", text: t, ...at, ...shape };
    sync.commit({ type: "note:add", note: n });
    return n;
  }
  /** A sticker showing `image` with its top-left at `at`, a little askew like one stuck by hand */
  function addSticker(image: ImageId, at: { x: number; y: number }, shape?: Shape) {
    const n: NewSticker = {
      id: uid(),
      kind: "sticker",
      image,
      ...at,
      ...(shape ?? { rot: Math.random() * 8 - 4, scale: 1 }),
    };
    sync.commit({ type: "note:add", note: n });
    return n;
  }
  /** What a text box says; blank, the box goes */
  function editText(id: NoteId, text: string) {
    const n = byId(id);
    if (n?.kind !== "text") return;
    const t = text.trim();
    if (t === "") remove(id);
    else if (t !== n.text) sync.commit({ type: "text:edit", id, text: t });
  }
  /** Only memos have fields to edit; a suggestion is adopted first. Whether it was made. */
  function update(id: NoteId, patch: MemoPatch) {
    return byId(id)?.kind === "memo" && sync.commit({ type: "note:update", id, patch });
  }
  /** Where a card is, and, when it was turned or resized, how it is turned and how large */
  function move(id: NoteId, x: number, y: number, shape?: Shape) {
    if (byId(id) === undefined) return;
    sync.commit({ type: "note:move", id, x, y, ...shape });
  }
  /**
   * A card on its way under a finger (moved, turned or resized): sent so the partner sees it
   * change, but not committed, since intermediate states are not changes to keep; letting go
   * is a `move`.
   */
  function sendMove(id: NoteId, x: number, y: number, shape?: Shape) {
    sync.send({ type: "note:move", id, x, y, ...shape });
  }
  function remove(id: NoteId) {
    sync.commit({ type: "note:delete", id });
  }
  /** Card `id` of `room` hidden (`on`) or shown again; whether that changed anything */
  function hide(room: RoomId, id: NoteId, on: boolean) {
    const was = leaving.value.get(room) ?? new Set<NoteId>();
    if (was.has(id) === on) return false;
    const next = new Set(was);
    if (on) next.add(id);
    else next.delete(id);
    leaving.value = new Map(leaving.value).set(room, next);
    return true;
  }
  /**
   * Card `id`, deleted in `room` (InRoom) with a moment to take it back: gone from every tab
   * at once, and from the room once `settle` is called; `undo` brings it back. Settling sends
   * the delete to `room` only, and only while it is open: the room settles what it holds open
   * before it is left (useRoom), so a delete is not lost, nor told to another room. `commits`
   * is the change settling makes, for the room to keep while the page is hidden.
   */
  function removeLater(room: RoomId, id: NoteId) {
    hide(room, id, true);
    return {
      undo: () => void hide(room, id, false),
      settle: () => {
        if (hide(room, id, false) && sync.room === room) remove(id);
      },
      commits: { type: "note:delete", id } as const,
    };
  }
  function duplicate(id: NoteId) {
    const n = byId(id);
    if (n === undefined) return;
    const at = { x: n.x + 24, y: n.y + 24 };
    if (n.kind === "text") return addText(n.text, at, { rot: n.rot, scale: n.scale });
    if (n.kind === "sticker") return addSticker(n.image, at, { rot: n.rot, scale: n.scale });
    return add(duplicateInput(n), at);
  }
  /** A suggestion becomes an ordinary memo; `by` still says whose idea it was */
  function adopt(id: NoteId) {
    if (byId(id)?.kind !== "suggestion") return;
    sync.commit({ type: "note:adopt", id });
  }

  return {
    notes,
    add,
    addText,
    addSticker,
    editText,
    update,
    move,
    sendMove,
    remove,
    removeLater,
    duplicate,
    adopt,
  };
});
