import type { Temporal } from "temporal-polyfill-lite";

import type { HexColor } from "../../shared/color";

import type { MemoPatch, NewMemo, NoteColor, NoteId } from "../notes/types";

/**
 * How the stores reach the room (useRoom installs it). `commit` is a change of ours: it shows
 * at once and is kept until the room answers (ledger.ts). `send` only passes something along
 * that is not a change to keep, such as a card's position while it is being dragged. Until a
 * room is installed both do nothing.
 */
export interface Transport {
  commit(msg: Mutation): void;
  send(msg: Mutation): void;
}
export type Mutation =
  | { type: "note:add"; note: NewMemo } // stamped with `by` and `updatedAt` when applied
  | { type: "note:update"; id: NoteId; patch: MemoPatch } // memos only
  | { type: "note:recolor"; id: NoteId; color: NoteColor }
  | { type: "note:adopt"; id: NoteId } // a suggestion becomes a memo
  // where a card is, and as it is turned or resized how it is turned and how large; throttled
  // while a finger holds it
  | { type: "note:move"; id: NoteId; x: number; y: number; rot?: number; scale?: number }
  | { type: "note:delete"; id: NoteId }
  | { type: "day:intro"; date: Temporal.PlainDate; intro: string }
  | { type: "member:profile"; name: string; color: HexColor }; // how the sender wants to be shown
