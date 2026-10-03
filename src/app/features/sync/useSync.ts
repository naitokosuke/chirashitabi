import { ref, shallowRef } from "vue";

import { defineStore } from "pinia";

import type { MemberId } from "../members/types";

import type { Mutation, Transport } from "./types";

/** Before a room is installed, changes go nowhere */
export const NOWHERE: Transport = { commit: () => {}, send: () => {} };

/**
 * The session, as the stores need it without depending on the room: which room's cache
 * entries they read (keys.ts), who this device is in it, and where their changes go.
 * `useRoom` sets all three.
 */
export const useSync = defineStore("sync", () => {
  const roomId = ref<string | null>(null);
  /** Who is using this device; their notes are signed with this id. "" until the room says */
  const me = ref("" as MemberId);
  const transport = shallowRef<Transport>(NOWHERE);
  const commit = (msg: Mutation) => transport.value.commit(msg);
  const send = (msg: Mutation) => transport.value.send(msg);
  return { roomId, me, transport, commit, send };
});
