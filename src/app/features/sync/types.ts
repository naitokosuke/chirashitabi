import type { Temporal } from "temporal-polyfill-lite";

import type { HexColor } from "../../shared/color";

import type { NoteId } from "../notes/id";
import type { MemoPatch, NewNote, NoteColor } from "../notes/types";
import type { Flight, Leg, Stay } from "../trip/types";

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
  // stamped with `by` and `updatedAt` when applied; a suggestion only ever comes from the room's agent
  | {
      type: "note:add";
      note: NewNote;
    }
  | { type: "note:update"; id: NoteId; patch: MemoPatch } // memos only
  | { type: "note:recolor"; id: NoteId; color: NoteColor }
  | { type: "note:adopt"; id: NoteId } // a suggestion becomes a memo
  | { type: "text:edit"; id: NoteId; text: string } // what a text box says, never empty
  // where a card is, and as it is turned or resized how it is turned and how large; throttled
  // while a finger holds it
  | { type: "note:move"; id: NoteId; x: number; y: number; rot?: number; scale?: number }
  | { type: "note:delete"; id: NoteId }
  | { type: "day:intro"; date: Temporal.PlainDate; intro: string }
  | { type: "member:profile"; name: string; color: HexColor } // how the sender wants to be shown
  | { type: "trip:rename"; name: string } // the trip's name, trimmed, never empty
  // when the trip is: its first day and how many days; what is planned moves with it
  | { type: "trip:dates"; first: Temporal.PlainDate; days: number }
  | { type: "trip:flight"; leg: Leg; flight: Flight | null }
  // where the nights are spent: the whole list, as the editor saves it
  | { type: "trip:stays"; stays: Stay[] };
