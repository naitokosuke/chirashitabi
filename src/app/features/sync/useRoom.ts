import { Temporal } from "temporal-polyfill-lite";

import { ref } from "vue";

import { defineStore } from "pinia";

import type { ServerMessage } from "../../../../worker/wire";
import type { MemberId } from "../members/types";
import { useMembers } from "../members/useMembers";
import { useNotes } from "../notes/useNotes";
import { useTrip } from "../trip/useTrip";

import type { Mutation } from "./types";
import { useSync } from "./useSync";
import { reviveMember, reviveMutation, reviveNote, reviveTrip } from "./wire";

export type RoomStatus =
  | "idle" // no room chosen
  | "connecting" // first connection, nothing on screen yet
  | "connected"
  | "reconnecting" // the screen stays; changes queue until the socket is back
  | "failed"; // gave up; the user can retry

const STORAGE_KEY = "chirashitabi:room";
const MAX_BACKOFF_MS = 30_000;

/**
 * The socket to a room. Connecting installs the transport the stores send
 * through and feeds what comes back into them: a snapshot replaces their
 * state, a mutation from the other member is applied as it is.
 */
export const useRoom = defineStore("room", () => {
  const sync = useSync();
  const members = useMembers();
  const trip = useTrip();
  const notes = useNotes();

  const status = ref<RoomStatus>("idle");
  const roomId = ref<string | null>(null);

  let ws: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Sent after the next snapshot: what was changed while the socket was down */
  let pending: Mutation[] = [];

  /** Remembered on this device so the next visit opens the same room */
  function remembered(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function connect(id: string) {
    leave();
    roomId.value = id;
    status.value = "connecting";
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // not remembered, nothing else changes
    }
    sync.transport = { send };
    open();
  }

  function leave() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    attempt = 0;
    pending = [];
    ws?.close(1000, "left");
    ws = null;
    roomId.value = null;
    status.value = "idle";
    sync.transport = { send: () => {} };
  }

  /** The mock room: the stores are filled by hand and nothing goes anywhere */
  function offline() {
    status.value = "connected";
  }

  function send(m: Mutation) {
    if (ws?.readyState === WebSocket.OPEN && status.value === "connected") {
      ws.send(JSON.stringify(m));
    } else {
      pending.push(m);
    }
  }

  function open() {
    if (roomId.value === null) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/api/rooms/${roomId.value}/ws`);
    ws = socket;
    socket.addEventListener("message", (e) =>
      onMessage(JSON.parse(String(e.data)) as ServerMessage),
    );
    socket.addEventListener("close", () => {
      if (ws !== socket) return; // superseded by leave() or a newer socket
      ws = null;
      retry();
    });
  }

  function retry() {
    if (attempt >= 8) {
      status.value = "failed";
      return;
    }
    status.value = status.value === "connecting" ? "connecting" : "reconnecting";
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
    timer = setTimeout(open, delay);
  }

  function reconnect() {
    attempt = 0;
    if (ws === null && roomId.value !== null) {
      status.value = "connecting";
      open();
    }
  }

  function onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "snapshot": {
        attempt = 0;
        members.apply(msg.members.map(reviveMember));
        members.me = msg.me as MemberId;
        trip.apply(reviveTrip(msg.trip));
        notes.apply(msg.notes.map(reviveNote));
        status.value = "connected";
        // What changed while we were away is applied on top again, then sent
        const queued = pending;
        pending = [];
        const now = Temporal.Now.instant();
        for (const m of queued) {
          apply(m, members.me, now);
          send(m);
        }
        return;
      }
      case "mutation":
        apply(
          reviveMutation(msg.mutation),
          msg.by as MemberId,
          Temporal.Instant.from(msg.updatedAt),
        );
        return;
      case "rejected":
        // The room refused something of ours; the next snapshot is the truth
        console.warn(`room: ${msg.reason}`);
        ws?.close(4000, "resync");
        return;
    }
  }

  function apply(m: Mutation, by: MemberId, at: Temporal.Instant) {
    switch (m.type) {
      case "day:intro":
        trip.receive(m.date, m.intro);
        return;
      case "member:profile":
        members.receive(by, m.name, m.color);
        return;
      default:
        notes.receive(m, by, at);
    }
  }

  return { status, roomId, remembered, connect, leave, reconnect, offline };
});
