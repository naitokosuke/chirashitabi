import type { Temporal } from "temporal-polyfill-lite";

import type { HexColor } from "../../shared/color";

import type { Memo, MemoPatch, NoteColor, NoteId } from "../notes/types";

/**
 * Transport is the only thing that changes when the Cloudflare room arrives:
 * `send` pushes a mutation, and the room calls the stores' `apply` with the
 * authoritative snapshot. Until then it is a local no-op.
 */
export interface Transport {
  send(msg: Mutation): void;
}
export type Mutation =
  | { type: "note:add"; note: Memo }
  | { type: "note:update"; id: NoteId; patch: MemoPatch } // memos only
  | { type: "note:recolor"; id: NoteId; color: NoteColor }
  | { type: "note:adopt"; id: NoteId } // a suggestion becomes a memo
  | { type: "note:move"; id: NoteId; x: number; y: number } // throttled while dragging
  | { type: "note:delete"; id: NoteId }
  | { type: "day:intro"; date: Temporal.PlainDate; intro: string }
  | { type: "member:profile"; name: string; color: HexColor }; // how the sender wants to be shown
