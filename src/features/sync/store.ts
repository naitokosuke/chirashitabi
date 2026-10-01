import { defineStore } from "pinia";
import { shallowRef } from "vue";
import type { Temporal } from "temporal-polyfill-lite";
import type { Note } from "@/features/notes/types";

/**
 * Transport is the only thing that changes when the Cloudflare room arrives:
 * `send` pushes a mutation, and the room calls the stores' `apply` with the
 * authoritative snapshot. Until then it is a local no-op.
 */
export interface Transport {
  send(msg: Mutation): void;
}
export type Mutation =
  | { type: "note:add"; note: Note }
  | { type: "note:update"; id: string; patch: Partial<Note> }
  | { type: "note:move"; id: string; x: number; y: number } // throttled while dragging
  | { type: "note:delete"; id: string }
  | { type: "day:intro"; date: Temporal.PlainDate; intro: string };

export const useSync = defineStore("sync", () => {
  const transport = shallowRef<Transport>({ send: () => {} });
  const send = (msg: Mutation) => transport.value.send(msg);
  return { transport, send };
});
