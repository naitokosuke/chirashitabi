import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { hexColor } from "../../shared/color";

import type { ServerMessage } from "../../../../worker/wire";
import type { MemberId } from "../members/types";
import type { NoteId } from "../notes/id";

import { createRoomSocket, type SocketLike, type SocketStatus } from "./socket";
import type { Mutation } from "./types";

/** A socket the test drives: it opens when told, and records what is sent */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Mutation[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private listeners = {
    message: [] as ((e: { data: unknown }) => void)[],
    close: [] as (() => void)[],
  };
  addEventListener(type: "message" | "close", listener: never) {
    this.listeners[type].push(listener);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Mutation);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  /** The room opens the connection and sends its first message */
  serve(msg: ServerMessage) {
    this.readyState = 1;
    for (const l of this.listeners.message) l({ data: JSON.stringify(msg) });
  }
  drop() {
    this.readyState = 3;
    for (const l of this.listeners.close) l();
  }
}

const snapshot: Extract<ServerMessage, { type: "snapshot" }> = {
  type: "snapshot",
  me: "yuki" as MemberId,
  members: [],
  trip: {} as never,
  notes: [],
};
const intro: Mutation = { type: "day:intro", date: "2026-11-03" as never, intro: "hi" };

function setup() {
  const sockets: FakeSocket[] = [];
  const statuses: SocketStatus[] = [];
  const snapshots: SocketStatus[] = []; // the status each snapshot found the socket in
  const mutations: ServerMessage[] = [];
  const answers: string[] = [];
  const people: unknown[] = [];
  const gone: string[] = [];
  const socket = createRoomSocket({
    open: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    onSnapshot: () => snapshots.push(socket.status),
    onMutation: (msg) => mutations.push(msg),
    onAck: (cid, at) => answers.push(`ack ${cid} ${at}`),
    onRejected: (cid, reason) => answers.push(`rejected ${cid} ${reason}`),
    onMembers: (members) => people.push(members),
    onGone: (reason) => gone.push(reason),
    onStatus: (s) => statuses.push(s),
  });
  const last = () => sockets.at(-1)!;
  return { socket, sockets, statuses, snapshots, mutations, answers, people, gone, last };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createRoomSocket", () => {
  test("connecting until the first snapshot, then connected", () => {
    const { socket, statuses, last } = setup();
    socket.connect("room-1");
    expect(socket.status).toBe("connecting");
    last().serve(snapshot);
    expect(statuses.at(-1)).toBe("connected");
  });

  test("sends at once while connected, with the cid beside the mutation when there is one", () => {
    const { socket, last } = setup();
    socket.connect("room-1");
    last().serve(snapshot);
    expect(socket.send(intro)).toBe(true);
    expect(socket.send(intro, "c1")).toBe(true);
    expect(last().sent).toEqual([intro, { ...intro, cid: "c1" }]);
  });

  test("while down nothing is sent, and the snapshot finds the socket connected so the caller can send again", () => {
    const { socket, sockets, snapshots, last } = setup();
    socket.connect("room-1");
    last().serve(snapshot);
    last().drop();
    expect(socket.status).toBe("reconnecting");
    expect(socket.send(intro, "c1")).toBe(false);
    expect(sockets[0]!.sent).toEqual([]);

    vi.advanceTimersByTime(1000);
    last().serve(snapshot);
    expect(snapshots).toEqual(["connected", "connected"]);
  });

  test("acks and rejections that name a cid go to the caller", () => {
    const { socket, answers, last } = setup();
    socket.connect("room-1");
    last().serve(snapshot);
    last().serve({ type: "ack", cid: "c1", updatedAt: "2026-10-01T00:00:00Z" });
    last().serve({ type: "rejected", cid: "c2", reason: "no such note" });
    expect(answers).toEqual(["ack c1 2026-10-01T00:00:00Z", "rejected c2 no such note"]);
    expect(last().closed).toBeNull();
  });

  test("backs off 1s, 2s, 4s… and gives up after eight tries", () => {
    const { socket, sockets, last } = setup();
    socket.connect("room-1");
    last().drop();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    last().drop();
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(3);
    for (let i = 3; i <= 8; i++) {
      last().drop();
      vi.advanceTimersByTime(30_000);
    }
    expect(sockets).toHaveLength(9);
    last().drop();
    expect(socket.status).toBe("failed");
  });

  test("a snapshot resets the back-off", () => {
    const { socket, sockets, last } = setup();
    socket.connect("room-1");
    last().drop();
    vi.advanceTimersByTime(1000);
    last().drop();
    vi.advanceTimersByTime(2000);
    last().serve(snapshot);
    last().drop();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(4);
  });

  test("a rejection that names no cid closes the socket so the next snapshot is the truth", () => {
    const { socket, last } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    socket.connect("room-1");
    last().serve(snapshot);
    last().serve({ type: "rejected", reason: "too many messages" });
    expect(last().closed).toEqual({ code: 4000, reason: "resync" });
  });

  test("relays a member's mutation", () => {
    const { socket, mutations, last } = setup();
    socket.connect("room-1");
    last().serve(snapshot);
    const msg: ServerMessage = {
      type: "mutation",
      mutation: { type: "note:delete", id: "a" as NoteId },
      by: "ken" as MemberId,
      updatedAt: "2026-10-01T00:00:00Z",
    };
    last().serve(msg);
    expect(mutations).toEqual([msg]);
  });

  test("leaving closes the socket, and an old socket's close is ignored", () => {
    const { socket, sockets, last } = setup();
    socket.connect("room-1");
    last().serve(snapshot);
    last().drop();
    socket.leave();
    expect(socket.status).toBe("idle");
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);

    socket.connect("room-2");
    const first = sockets[0]!;
    first.drop(); // the old socket closing late changes nothing
    expect(socket.status).toBe("connecting");
    last().serve(snapshot);
    expect(last().sent).toEqual([]);
  });

  test("reconnect tries again at once after giving up", () => {
    const { socket, sockets, last } = setup();
    socket.connect("room-1");
    for (let i = 0; i < 8; i++) {
      last().drop();
      vi.advanceTimersByTime(30_000);
    }
    last().drop();
    expect(socket.status).toBe("failed");
    socket.reconnect();
    expect(socket.status).toBe("connecting");
    expect(sockets).toHaveLength(10);
  });

  test("passes on who is in the room now", () => {
    const { socket, people, last } = setup();
    socket.connect("room-1");
    last().serve(snapshot);
    const members = [
      {
        id: "ken" as MemberId,
        kind: "person" as const,
        role: "guest" as const,
        name: "Ken",
        color: hexColor("#d7263d")!,
      },
    ];
    last().serve({ type: "members", members });
    expect(people).toEqual([members]);
  });

  test("out of the room it leaves, says why, and does not try again when the room closes it", () => {
    const { socket, sockets, gone, last } = setup();
    socket.connect("room-1");
    last().serve(snapshot);
    last().serve({ type: "gone", reason: "removed" });
    expect(gone).toEqual(["removed"]);
    expect(socket.status).toBe("idle");
    expect(socket.roomId).toBeNull();
    last().drop();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});
