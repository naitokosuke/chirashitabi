import { Temporal } from "temporal-polyfill-lite";

import { ref } from "vue";

import { defineStore } from "pinia";

import type { MemberId } from "../members/types";
import { useMembers } from "../members/useMembers";
import { useNotes } from "../notes/useNotes";
import { useTrip } from "../trip/useTrip";

import { createRoomSocket, type SocketStatus } from "./socket";
import type { Mutation } from "./types";
import { useSync } from "./useSync";
import { reviveMember, reviveMutation, reviveNote, reviveTrip } from "./wire";

export type RoomStatus = SocketStatus;

const STORAGE_KEY = "chirashitabi:room";

/**
 * A room, as the stores see it. The socket (socket.ts) connects and queues; this feeds what
 * comes back into the stores: a snapshot replaces their state and what was changed here while
 * the socket was down is applied on top again, and a mutation from another member is applied
 * as it is. Connecting installs the transport the stores send through.
 */
export const useRoom = defineStore("room", () => {
  const sync = useSync();
  const members = useMembers();
  const trip = useTrip();
  const notes = useNotes();

  const status = ref<RoomStatus>("idle");
  const roomId = ref<string | null>(null);

  /** One mutation, from whoever, into whichever store it concerns */
  function apply(m: Mutation, by: MemberId, at: Temporal.Instant) {
    switch (m.type) {
      case "day:intro":
        trip.receive(m);
        return;
      case "member:profile":
        members.receive(m, by);
        return;
      default:
        notes.receive(m, by, at);
    }
  }

  const socket = createRoomSocket({
    onSnapshot(msg, queued) {
      members.apply(msg.members.map(reviveMember));
      members.me = msg.me as MemberId;
      trip.apply(reviveTrip(msg.trip));
      notes.apply(msg.notes.map(reviveNote));
      // What changed while we were away is applied on top again; the socket sends it next
      const now = Temporal.Now.instant();
      for (const m of queued) apply(m, members.me, now);
    },
    onMutation(msg) {
      apply(reviveMutation(msg.mutation), msg.by as MemberId, Temporal.Instant.from(msg.updatedAt));
    },
    onStatus(next) {
      status.value = next;
    },
  });

  /** Remembered on this device so the next visit opens the same room */
  function remembered(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function connect(id: string) {
    roomId.value = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // not remembered, nothing else changes
    }
    socket.connect(id);
    sync.transport = { send: socket.send };
  }

  function leave() {
    socket.leave();
    roomId.value = null;
    sync.transport = { send: () => {} };
  }

  /** The mock room: the stores are filled by hand and nothing goes anywhere */
  function offline() {
    status.value = "connected";
  }

  return { status, roomId, remembered, connect, leave, reconnect: socket.reconnect, offline };
});
