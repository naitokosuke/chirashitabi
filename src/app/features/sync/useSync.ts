import { ref, shallowRef } from "vue";

import { defineStore } from "pinia";

import type { Mutation, Transport } from "./types";

/**
 * What the stores need of the room without depending on it: where to send a mutation, and
 * which room's cache entries they read (keys.ts). `useRoom` sets both when it connects.
 */
export const useSync = defineStore("sync", () => {
  const transport = shallowRef<Transport>({ send: () => {} });
  const roomId = ref<string | null>(null);
  const send = (msg: Mutation) => transport.value.send(msg);
  return { transport, roomId, send };
});
