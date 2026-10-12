import type { GoneReason, ServerMessage } from "../../../../worker/wire";

import type { Mutation } from "./types";

export type SocketStatus =
  | "idle" // no room chosen
  | "connecting" // first connection, nothing on screen yet
  | "connected"
  | "reconnecting" // the screen stays; changes queue until the socket is back
  | "failed"; // gave up; the user can retry

/** The part of a WebSocket this uses, so tests can hand in a fake */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (e: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: () => void): void;
}

export interface RoomSocketOptions {
  /** Opens a socket to a room; defaults to a WebSocket on this origin's `/api/rooms/<id>/ws` */
  open?: (roomId: string) => SocketLike;
  /** The room's state, whole; the socket is connected by then, so what is pending can be sent again */
  onSnapshot(msg: Extract<ServerMessage, { type: "snapshot" }>): void;
  /** A member's change, relayed by the room */
  onMutation(msg: Extract<ServerMessage, { type: "mutation" }>): void;
  /** The room applied one of ours, sent with this `cid`, at `updatedAt` */
  onAck(cid: string, updatedAt: string): void;
  /** The room refused one of ours */
  onRejected(cid: string, reason: string): void;
  /** Someone joined, was removed or left: who is in the room now */
  onMembers(members: Extract<ServerMessage, { type: "members" }>["members"]): void;
  /**
   * This device's person is out of the room, or the room was deleted. The socket has left by
   * then (status idle) and does not try again: nothing would let it back in.
   */
  onGone(reason: GoneReason): void;
  onStatus(status: SocketStatus): void;
}

const OPEN = 1;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 30_000;

function openOnThisOrigin(roomId: string): SocketLike {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return new WebSocket(`${scheme}://${location.host}/api/rooms/${roomId}/ws`);
}

/**
 * The socket to a room, and nothing else: connecting, backing off and retrying, and the
 * status. What the messages mean, and what to send again after a reconnect, is the caller's
 * (ledger.ts, docs/data-fetching.md). The room's first message on every connection is a
 * snapshot, so a reconnect is a resync. A message sent while the socket is down is dropped.
 */
export function createRoomSocket(options: RoomSocketOptions) {
  const open = options.open ?? openOnThisOrigin;
  let status: SocketStatus = "idle";
  let roomId: string | null = null;
  let ws: SocketLike | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function setStatus(next: SocketStatus) {
    status = next;
    options.onStatus(next);
  }

  function dial() {
    if (roomId === null) return;
    const socket = open(roomId);
    ws = socket;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the room's own messages, every field checked by it before it sent them
    socket.addEventListener("message", (e) => receive(JSON.parse(String(e.data)) as ServerMessage));
    socket.addEventListener("close", () => {
      if (ws !== socket) return; // superseded by leave() or a newer socket
      ws = null;
      retry();
    });
  }

  function retry() {
    if (attempt >= MAX_ATTEMPTS) {
      setStatus("failed");
      return;
    }
    setStatus(status === "connecting" ? "connecting" : "reconnecting");
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
    timer = setTimeout(dial, delay);
  }

  function receive(msg: ServerMessage) {
    switch (msg.type) {
      case "snapshot":
        attempt = 0;
        setStatus("connected");
        options.onSnapshot(msg);
        return;
      case "mutation":
        options.onMutation(msg);
        return;
      case "ack":
        options.onAck(msg.cid, msg.updatedAt);
        return;
      case "rejected":
        if (msg.cid !== undefined) {
          options.onRejected(msg.cid, msg.reason);
          return;
        }
        // refused without saying which (it could not read ours): the next snapshot is the truth
        console.warn(`room: ${msg.reason}`);
        ws?.close(4000, "resync");
        return;
      case "members":
        options.onMembers(msg.members);
        return;
      case "gone":
        leave();
        options.onGone(msg.reason);
        return;
    }
  }

  /** Sends now if connected; `cid` asks the room to answer. Returns whether it went */
  function send(m: Mutation, cid?: string): boolean {
    if (ws?.readyState !== OPEN || status !== "connected") return false;
    ws.send(JSON.stringify(cid === undefined ? m : { ...m, cid }));
    return true;
  }

  function leave() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    attempt = 0;
    ws?.close(1000, "left");
    ws = null;
    roomId = null;
    setStatus("idle");
  }

  function connect(id: string) {
    leave();
    roomId = id;
    setStatus("connecting");
    dial();
  }

  /** Try again now, after giving up or while waiting to */
  function reconnect() {
    attempt = 0;
    if (ws !== null || roomId === null) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    setStatus("connecting");
    dial();
  }

  return {
    connect,
    leave,
    reconnect,
    send,
    get status() {
      return status;
    },
    get roomId() {
      return roomId;
    },
  };
}

export type RoomSocket = ReturnType<typeof createRoomSocket>;
