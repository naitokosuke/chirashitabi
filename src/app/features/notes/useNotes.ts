import { defineQuery, useQueryState } from "@pinia/colada";

import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import type { NoteId } from "./id";
import { duplicateInput } from "./input";
import type { MemoPatch, NewMemo, NewText, NoteColor, NoteInput } from "./types";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
const uid = () => Math.random().toString(36).slice(2, 10) as NoteId;

/** How a card is turned (degrees) and how large it is drawn */
export interface Shape {
  rot: number;
  scale: number;
}

/**
 * The room's notes, as the query cache holds them (keys.ts), and the
 * changes one can make to them. A change is committed to the room, which shows it at once
 * and keeps it until the room answers (ledger.ts, docs/data-fetching.md). Hold a note by its
 * id, not by the object: the object is replaced whenever the note changes. The notes are
 * undefined until the room's first snapshot. Defined once for the app (defineQuery).
 */
export const useNotes = defineQuery(() => {
  const sync = useSync();
  const { data: notes } = useQueryState(() => roomKeys.notes(sync.room.id));
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
    const n: NewText = { id: uid(), kind: "text", title: t, color: "#ffffff", ...at, ...shape };
    sync.commit({ type: "note:add", note: n });
    return n;
  }
  /** What a text box says; blank, the box goes */
  function editText(id: NoteId, text: string) {
    const n = byId(id);
    if (n?.kind !== "text") return;
    const t = text.trim();
    if (t === "") remove(id);
    else if (t !== n.title) sync.commit({ type: "text:edit", id, text: t });
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
  function duplicate(id: NoteId) {
    const n = byId(id);
    if (n === undefined) return;
    const at = { x: n.x + 24, y: n.y + 24 };
    if (n.kind === "text") return addText(n.title, at, { rot: n.rot, scale: n.scale });
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
    editText,
    update,
    recolor,
    move,
    sendMove,
    remove,
    duplicate,
    adopt,
  };
});
