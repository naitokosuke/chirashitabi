import { hc } from "hono/client";
import * as v from "valibot";

import type { Api } from "../../../../.worker-types/worker";
import { HEARTBEAT, RATE } from "../../../contract/room";
import type { RoomId } from "../rooms/types";

import type { Mutation } from "./types";
import {
  ServerMessageSchema,
  wireMutation,
  type Cid,
  type ClientMessage,
  type GoneReason,
  type IsoInstant,
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
  /** Opens a socket to a room; defaults to a WebSocket to the room's route on this origin */
  open?: (roomId: RoomId) => SocketLike;
  /**
   * Ours the room has not answered, oldest first (the ledger's). Each goes once on every
   * connection, after its snapshot or when `flush` is called, at a pace the room takes.
   */
  pending(): readonly { m: Mutation; cid: Cid }[];
  /** The room's state, whole; what is pending is sent again right after */
  onSnapshot(msg: Extract<ServerMessage, { type: "snapshot" }>): void;
  /** A member's change, relayed by the room */
  onMutation(msg: Extract<ServerMessage, { type: "mutation" }>): void;
  /** The room applied one of ours, sent with this `cid`, at `updatedAt` */
  onAck(cid: Cid, updatedAt: IsoInstant): void;
  /**
   * The room refused one of ours. One refused only for coming too fast is not passed on: it
   * goes again once the room's window has passed.
   */
  onRejected(cid: Cid, reason: RejectReason): void;
  /** Someone joined, was removed or left: who is in the room now */
  onMembers(members: Extract<ServerMessage, { type: "members" }>["members"]): void;
  /**
   * This device's person is out of the room, or the room was deleted. The socket has left by
   * then (status idle) and does not try again: nothing would let it back in.
   */
  onGone(reason: GoneReason): void;
  /**
   * A connection closed before the room said anything: the network is down, or the room
   * refused this device without a word (an upgrade it refuses is a plain 403)
   */
  onUnanswered(): void;
  onStatus(status: SocketStatus): void;
}

/** A message on the socket: JSON, and one the room sends */
const MessageSchema = v.pipe(v.string(), v.parseJson(), ServerMessageSchema);

const OPEN = 1;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 30_000;
/** A connection up this long was a good one: the back-off starts over once it drops */
const HEALTHY_MS = 10_000;
/** A ping this often; no pong by the next one is a link gone without a close (half-open) */
const PING_MS = 20_000;
/**
 * How fast ours go: half what the room takes from a member in its window, so no window of the
 * room's ever counts more than it takes
 */
const PACE = { window: RATE.window, max: RATE.max / 2 };

function openOnThisOrigin(roomId: RoomId): SocketLike {
  const url = hc<Api>(location.origin).api.rooms[":roomId"].ws.$url({ param: { roomId } });
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(url);
}

/**
 * The socket to a room, and nothing else: connecting, backing off and retrying, a heartbeat,
 * the status, and sending what the caller has pending at a pace the room takes. What the
 * messages mean, and what is pending, is the caller's (ledger.ts, docs/data-fetching.md). The
 * room's first message on every connection is a snapshot, so a reconnect is a resync. A
 * message sent while the socket is down is dropped; what is pending goes on the next one.
 */
export function createRoomSocket(options: RoomSocketOptions) {
  const open = options.open ?? openOnThisOrigin;
  /**
   * One connection: its socket, which of ours went on it, since when the room has answered on
   * it (its snapshot), and its heartbeat
   */
  interface Connection {
    ws: SocketLike;
    sent: Set<Cid>;
    upSince: number | null;
    beat: ReturnType<typeof setInterval> | null;
    ponged: boolean;
  }
  /**
   * No room chosen, or one: the connection to it while there is one (null between tries), how
   * many tries the back-off has made, the next try's timer, and the timer of what of ours waits
   * on the pace. One object per room chosen, so a socket's listener can tell it was left behind.
   */
  type Line =
    | { status: "idle" }
    | {
        status: Exclude<SocketStatus, "idle">;
        roomId: RoomId;
        conn: Connection | null;
        attempt: number;
        timer: ReturnType<typeof setTimeout> | null;
        waiting: ReturnType<typeof setTimeout> | null;
      };
  let line: Line = { status: "idle" };
  /** Ours sent in the pace's current window, across connections: the room counts them so */
  let pace = { since: 0, n: 0 };

  function setStatus(next: Exclude<SocketStatus, "idle">) {
    if (line.status === "idle") return;
    line.status = next;
    options.onStatus(next);
  }

  function dial() {
    const room = line;
    if (room.status === "idle") return;
    const conn: Connection = {
      ws: open(room.roomId),
      sent: new Set(),
      upSince: null,
      beat: null,
      ponged: true,
    };
    room.conn = conn;
    conn.ws.addEventListener("message", (e) => {
      // superseded by leave(), another room, or a newer socket
      if (line !== room || room.conn !== conn) return;
      if (e.data === HEARTBEAT.pong) {
        conn.ponged = true;
        return;
      }
      const msg = v.safeParse(MessageSchema, String(e.data));
      if (msg.success) {
        receive(msg.output, conn);
        return;
      }
      // a message this app cannot read (a room newer than it, or a broken one): the next
      // snapshot is the truth; one it cannot read either backs off until the socket gives up
      console.warn("room: a message this app cannot read");
      resync();
    });
    conn.ws.addEventListener("close", () => {
      if (line !== room || room.conn !== conn) return;
      lost(conn);
    });
  }

  /**
   * The connection is gone, closed or silent: another try. The back-off starts over only after
   * a connection that stayed up, so one the room keeps closing at once still backs off.
   */
  function lost(conn: Connection) {
    const room = line;
    if (room.status === "idle") return;
    if (conn.beat !== null) clearInterval(conn.beat);
    room.conn = null;
    if (conn.upSince === null) options.onUnanswered();
    else if (Date.now() - conn.upSince >= HEALTHY_MS) room.attempt = 0;
    retry();
  }

  /** A ping, unless the last one went unanswered: then the link is gone, whether or not it says so */
  function beat(conn: Connection) {
    if (!conn.ponged) {
      conn.ws.close(4000, "no pong");
      lost(conn);
      return;
    }
    conn.ponged = false;
    if (conn.ws.readyState === OPEN) conn.ws.send(HEARTBEAT.ping);
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
    if (line.status !== "idle") line.conn?.ws.close(4000, "resync");
  }

  function receive(msg: ServerMessage, conn: Connection) {
    switch (msg.type) {
      case "snapshot":
        if (conn.upSince === null) {
          conn.upSince = Date.now();
          conn.beat = setInterval(() => beat(conn), PING_MS);
        }
        setStatus("connected");
        options.onSnapshot(msg);
        flush();
        return;
      case "mutation":
        options.onMutation(msg);
        return;
      case "ack":
        options.onAck(msg.cid, msg.updatedAt);
        return;
      case "unread":
        // it could not read one of ours, and cannot say which: the next snapshot is the truth
        console.warn(`room: ${msg.reason}`);
        resync();
        return;
      case "rejected":
        // ours that need an answer all carry a cid; a refusal without one names nothing that
        // waits on it (a card under a finger), and the socket goes on
        if (msg.cid === undefined) return;
        if (msg.reason === "too many messages") {
          // not refused for what it is: it goes again, and nothing more until a window passes
          conn.sent.delete(msg.cid);
          pace = { since: Date.now(), n: PACE.max };
          flush();
          return;
        }
        options.onRejected(msg.cid, msg.reason);
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

  /**
   * Sends now if connected; `cid` asks the room to answer. Returns whether it went. Ours that
   * need an answer go through `flush`, at the pace; this is for a card on its way under a finger.
   */
  function send(m: Mutation, cid?: Cid): boolean {
    if (line.status !== "connected" || line.conn?.ws.readyState !== OPEN) return false;
    const out = wireMutation(m);
    line.conn.ws.send(
      JSON.stringify((cid === undefined ? out : { ...out, cid }) satisfies ClientMessage),
    );
    return true;
  }

  /**
   * Sends what is pending and has not gone on this connection, oldest first; past the pace,
   * the rest waits for the next window
   */
  function flush() {
    const room = line;
    if (room.status !== "connected" || room.conn === null || room.waiting !== null) return;
    const { sent } = room.conn;
    for (const p of options.pending()) {
      if (sent.has(p.cid)) continue;
      const now = Date.now();
      if (now - pace.since >= PACE.window) pace = { since: now, n: 0 };
      if (pace.n >= PACE.max) {
        room.waiting = setTimeout(
          () => {
            room.waiting = null;
            flush();
          },
          pace.since + PACE.window - now,
        );
        return;
      }
      if (!send(p.m, p.cid)) return;
      sent.add(p.cid);
      pace.n++;
    }
  }

  function leave() {
    const room = line;
    line = { status: "idle" };
    if (room.status !== "idle") {
      if (room.timer !== null) clearTimeout(room.timer);
      if (room.waiting !== null) clearTimeout(room.waiting);
      if (room.conn !== null) {
        if (room.conn.beat !== null) clearInterval(room.conn.beat);
        room.conn.ws.close(1000, "left");
      }
    }
    options.onStatus("idle");
  }

  function connect(id: RoomId) {
    leave();
    line = { status: "connecting", roomId: id, conn: null, attempt: 0, timer: null, waiting: null };
    options.onStatus("connecting");
    dial();
  }

  /** Try again now, after giving up or while waiting to */
  function reconnect() {
    const room = line;
    if (room.status === "idle") return;
    room.attempt = 0;
    if (room.conn !== null) return;
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
    flush,
    get status(): SocketStatus {
      return line.status;
    },
    get roomId() {
      return line.status === "idle" ? null : line.roomId;
    },
  };
}

export type RoomSocket = ReturnType<typeof createRoomSocket>;
