import * as v from "valibot";

import type { RoomId } from "../rooms/types";

import type { Mutation } from "./types";
import {
  ServerMessageSchema,
  wireMutation,
  type Cid,
  type ClientMessage,
  type GoneReason,
  type RejectReason,
  type ServerMessage,
} from "./wire";

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
  open?: (roomId: RoomId) => SocketLike;
  /** The room's state, whole; the socket is connected by then, so what is pending can be sent again */
  onSnapshot(msg: Extract<ServerMessage, { type: "snapshot" }>): void;
  /** A member's change, relayed by the room */
  onMutation(msg: Extract<ServerMessage, { type: "mutation" }>): void;
  /** The room applied one of ours, sent with this `cid`, at `updatedAt` */
  onAck(cid: Cid, updatedAt: string): void;
  /** The room refused one of ours */
  onRejected(cid: Cid, reason: RejectReason): void;
  /** Someone joined, was removed or left: who is in the room now */
  onMembers(members: Extract<ServerMessage, { type: "members" }>["members"]): void;
  /**
   * This device's person is out of the room, or the room was deleted. The socket has left by
   * then (status idle) and does not try again: nothing would let it back in.
   */
  onGone(reason: GoneReason): void;
  onStatus(status: SocketStatus): void;
}

/** A message on the socket: JSON, and one the room sends */
const MessageSchema = v.pipe(v.string(), v.parseJson(), ServerMessageSchema);

const OPEN = 1;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 30_000;

function openOnThisOrigin(roomId: RoomId): SocketLike {
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
  /**
   * No room chosen, or one: the socket to it while there is one (null between tries), how many
   * tries the back-off has made, and the next try's timer. One object per room chosen, so a
   * socket's listener can tell it was left behind.
   */
  type Line =
    | { status: "idle" }
    | {
        status: Exclude<SocketStatus, "idle">;
        roomId: RoomId;
        ws: SocketLike | null;
        attempt: number;
        timer: ReturnType<typeof setTimeout> | null;
      };
  let line: Line = { status: "idle" };

  function setStatus(next: Exclude<SocketStatus, "idle">) {
    if (line.status === "idle") return;
    line.status = next;
    options.onStatus(next);
  }

  function dial() {
    const room = line;
    if (room.status === "idle") return;
    const socket = open(room.roomId);
    room.ws = socket;
    socket.addEventListener("message", (e) => {
      const msg = v.safeParse(MessageSchema, String(e.data));
      if (msg.success) {
        receive(msg.output);
        return;
      }
      // a message this app cannot read (a room newer than it, or a broken one): the next
      // snapshot is the truth; one it cannot read either backs off until the socket gives up
      console.warn("room: a message this app cannot read");
      resync();
    });
    socket.addEventListener("close", () => {
      // superseded by leave(), another room, or a newer socket
      if (line !== room || room.ws !== socket) return;
      room.ws = null;
      retry();
    });
  }

  function retry() {
    const room = line;
    if (room.status === "idle") return;
    if (room.attempt >= MAX_ATTEMPTS) {
      setStatus("failed");
      return;
    }
    setStatus(room.status === "connecting" ? "connecting" : "reconnecting");
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** room.attempt++);
    room.timer = setTimeout(dial, delay);
  }

  /** Closes the socket so the next one starts over from a snapshot */
  function resync() {
    if (line.status !== "idle") line.ws?.close(4000, "resync");
  }

  function receive(msg: ServerMessage) {
    switch (msg.type) {
      case "snapshot":
        if (line.status !== "idle") line.attempt = 0;
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
        if ("cid" in msg && msg.cid !== undefined) {
          options.onRejected(msg.cid, msg.reason);
          return;
        }
        // refused without saying which (it could not read ours): the next snapshot is the truth
        console.warn(`room: ${msg.reason}`);
        resync();
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
  function send(m: Mutation, cid?: Cid): boolean {
    if (line.status !== "connected" || line.ws?.readyState !== OPEN) return false;
    const out = wireMutation(m);
    line.ws.send(
      JSON.stringify((cid === undefined ? out : { ...out, cid }) satisfies ClientMessage),
    );
    return true;
  }

  function leave() {
    const room = line;
    line = { status: "idle" };
    if (room.status !== "idle") {
      if (room.timer !== null) clearTimeout(room.timer);
      room.ws?.close(1000, "left");
    }
    options.onStatus("idle");
  }

  function connect(id: RoomId) {
    leave();
    line = { status: "connecting", roomId: id, ws: null, attempt: 0, timer: null };
    options.onStatus("connecting");
    dial();
  }

  /** Try again now, after giving up or while waiting to */
  function reconnect() {
    const room = line;
    if (room.status === "idle") return;
    room.attempt = 0;
    if (room.ws !== null) return;
    if (room.timer !== null) clearTimeout(room.timer);
    room.timer = null;
    setStatus("connecting");
    dial();
  }

  return {
    connect,
    leave,
    reconnect,
    send,
    get status(): SocketStatus {
      return line.status;
    },
    get roomId() {
      return line.status === "idle" ? null : line.roomId;
    },
  };
}

export type RoomSocket = ReturnType<typeof createRoomSocket>;
