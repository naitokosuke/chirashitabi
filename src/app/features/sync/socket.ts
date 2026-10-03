import type { ServerMessage } from "../../../../worker/wire";

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
  /** The room's state, and what was changed here while the socket was down: apply both, in that order */
  onSnapshot(msg: Extract<ServerMessage, { type: "snapshot" }>, queued: readonly Mutation[]): void;
  /** A member's change, relayed by the room */
  onMutation(msg: Extract<ServerMessage, { type: "mutation" }>): void;
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
 * The socket to a room, and nothing else: connecting, backing off and retrying, queueing what
 * is sent while it is down, and the status. What the messages mean is the caller's
 * (docs/data-fetching.md). The room's first message on every connection is a snapshot, so a
 * reconnect is a resync: the queue is handed over with it and then sent.
 */
export function createRoomSocket(options: RoomSocketOptions) {
  const open = options.open ?? openOnThisOrigin;
  let status: SocketStatus = "idle";
  let roomId: string | null = null;
  let ws: SocketLike | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Mutation[] = [];

  function setStatus(next: SocketStatus) {
    status = next;
    options.onStatus(next);
  }

  function dial() {
    if (roomId === null) return;
    const socket = open(roomId);
    ws = socket;
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
      case "snapshot": {
        attempt = 0;
        const queued = pending;
        pending = [];
        options.onSnapshot(msg, queued);
        setStatus("connected");
        for (const m of queued) send(m);
        return;
      }
      case "mutation":
        options.onMutation(msg);
        return;
      case "rejected":
        // The room refused something of ours; the next snapshot is the truth
        console.warn(`room: ${msg.reason}`);
        ws?.close(4000, "resync");
        return;
    }
  }

  function send(m: Mutation) {
    if (ws?.readyState === OPEN && status === "connected") ws.send(JSON.stringify(m));
    else pending.push(m);
  }

  function leave() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    attempt = 0;
    pending = [];
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
