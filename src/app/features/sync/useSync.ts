import { ref, shallowRef } from "vue";

import { defineStore } from "pinia";

import type { Mutation, Transport } from "./types";

/** Before a room is installed, changes go nowhere */
export const NOWHERE: Transport = { commit: () => {}, send: () => {} };

/**
 * What the stores need of the room without depending on it: where their changes go, and
 * which room's cache entries they read (keys.ts). `useRoom` sets both.
 */
export const useSync = defineStore("sync", () => {
  const transport = shallowRef<Transport>(NOWHERE);
  const roomId = ref<string | null>(null);
  const commit = (msg: Mutation) => transport.value.commit(msg);
  const send = (msg: Mutation) => transport.value.send(msg);
  return { transport, roomId, commit, send };
});
