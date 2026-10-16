import { computed, shallowRef } from "vue";

import { defineStore } from "pinia";

import { OUT, roomOf, type Session } from "./session";
import type { Mutation, Transport } from "./types";

/** Before a room is installed, changes go nowhere */
export const NOWHERE: Transport = { commit: () => {}, send: () => {} };

/**
 * The session (session.ts) and where changes go, as the stores need them without depending
 * on the room: which room's cache entries they read (keys.ts), and who this device is in it.
 * `useRoom` moves the session, and installs the transport once: it acts only while in a room.
 */
export const useSync = defineStore("sync", () => {
  const session = shallowRef<Session>(OUT);
  const transport = shallowRef<Transport>(NOWHERE);
  /** The room whose cache entries the stores read; none out of a room */
  const room = computed(() => roomOf(session.value));
  /** Who is using this device, once in a room; their notes are signed with this id */
  const me = computed(() => (session.value.kind === "in" ? session.value.me : null));
  const commit = (msg: Mutation) => transport.value.commit(msg);
  const send = (msg: Mutation) => transport.value.send(msg);
  return { session, transport, room, me, commit, send };
});
