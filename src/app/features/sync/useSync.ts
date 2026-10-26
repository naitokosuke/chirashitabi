import { computed, shallowRef } from "vue";

import { defineStore } from "pinia";

import { OUT, roomOf, type Session } from "./session";
import type { Mutation, Transport } from "./types";

/**
 * Before the room store is made, changes go nowhere. None is made then: what makes changes is
 * shown only inside a room, under the page that makes the room store first.
 */
const NOWHERE: Transport = { commit: () => false, send: () => {} };

/**
 * The session (session.ts) and where changes go, as the stores need them without depending
 * on the room: which room's cache entries they read (keys.ts). `useRoom` moves the session, and
 * installs the transport once: it acts only while in a room. What is shown inside a room reads
 * the room and who this device is there from InRoom instead, never null.
 */
export const useSync = defineStore("sync", () => {
  const session = shallowRef<Session>(OUT);
  const transport = shallowRef<Transport>(NOWHERE);
  /** The room whose cache entries the stores read; none out of a room */
  const room = computed(() => roomOf(session.value));
  const commit = (...msgs: Mutation[]) => transport.value.commit(...msgs);
  const send = (msg: Mutation) => transport.value.send(msg);
  return { session, transport, room, commit, send };
});
