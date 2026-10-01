import type { Temporal } from "temporal-polyfill-lite";
import type { Memo, MemoPatch } from "@/features/notes/types";

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
  | { type: "note:update"; id: string; patch: MemoPatch } // memos only
  | { type: "note:recolor"; id: string; color: string }
  | { type: "note:adopt"; id: string } // a suggestion becomes a memo
  | { type: "note:move"; id: string; x: number; y: number } // throttled while dragging
  | { type: "note:delete"; id: string }
  | { type: "day:intro"; date: Temporal.PlainDate; intro: string };
