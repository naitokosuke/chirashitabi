import { createApp } from "vue";

import { createPinia, setActivePinia } from "pinia";

import { PiniaColada, useQueryCache } from "@pinia/colada";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { makeWireMemo } from "../../../contract/fixtures";
import { EmailSchema, MemberIdSchema } from "../members/types";
import { parseImageId } from "../notes/id";
import { imageSrc } from "../notes/image";
import { RoomIdSchema, type RoomId } from "../rooms/types";
import { useToast } from "../toast/useToast";

import { roomKeys } from "./keys";
import { claim, kept } from "./persist";
import type { Mutation } from "./types";
import { useRoom } from "./useRoom";
import { useSync } from "./useSync";

const ROOM = v.parse(RoomIdSchema, "b082573b-b38b-4298-90be-f034f8b7d898");
const OTHER_ROOM = v.parse(RoomIdSchema, "5d7c2f0e-8a41-4b3e-9f60-2c1d7e8b9a10");
const YUKI = v.parse(MemberIdSchema, "0b0d6f1e-5c1a-4e8b-9a43-7f2d1c6e9a01");
const KEN = v.parse(MemberIdSchema, "4e7a2c90-3b5d-4f16-8e21-a9c4d0b7f302");
const YUKI_MAIL = v.parse(EmailSchema, "yuki@example.com");
const KEN_MAIL = v.parse(EmailSchema, "ken@example.com");
const PICTURE = parseImageId("0f8fad5b-d9cb-469f-a165-70867728950e")!;

/** A Storage that lives in a Map, standing in for this device's localStorage */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

/** A WebSocket the test drives: it opens when the room first speaks, and records what is sent */
class FakeSocket {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closed = false;
  private listeners = {
    message: [] as ((e: { data: unknown }) => void)[],
    close: [] as (() => void)[],
  };
  constructor(readonly url: URL) {}
  addEventListener(type: "message" | "close", listener: never) {
    this.listeners[type].push(listener);
  }
  send(data: string) {
    if (data !== "ping") this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    this.closed = true;
  }
  /** The room speaks on the connection */
  serve(msg: Record<string, unknown>) {
    this.readyState = 1;
    for (const l of this.listeners.message) l({ data: JSON.stringify(msg) });
  }
  drop() {
    this.readyState = 3;
    for (const l of this.listeners.close) l();
  }
}

const trip = {
  name: "Taiwan trip",
  days: [{ date: "2026-11-03", intro: "" }],
  currency: "TWD",
  center: { lat: 25.05, lng: 121.54 },
  flights: { out: null, back: null },
  stays: [],
};
const yuki = { id: YUKI, kind: "person", role: "owner", name: "Yuki", color: "#3c6ee0" };
const ken = { id: KEN, kind: "person", role: "guest", name: "Ken", color: "#d97757" };
/** The room's first message on a connection: a memo with a picture, and Yuki as this device */
const snapshot = (me = YUKI) => ({
  type: "snapshot",
  me,
  members: [yuki],
  trip,
  notes: [makeWireMemo("n1", { image: PICTURE })],
});
const remove: Mutation = { type: "note:delete", id: makeWireMemo("n1").id };

/** `/api/me` as the Worker answers it: `email` signed in, in `rooms` */
const mine = (email: string, rooms: RoomId[], deleted: RoomId[] = []) =>
  Response.json({
    email,
    rooms: rooms.map((id) => ({
      id,
      name: "Taiwan trip",
      members: [],
      memos: 1,
      owner: true,
      first: "2026-11-03",
      days: 1,
    })),
    invitations: [],
    deleted: deleted.map((id) => ({ id, name: "Old trip", deletedAt: "2026-10-01T00:00:00Z" })),
  });

/**
 * The browser around the room store, in Node: a window and a document to dispatch to, this
 * device's storage, sockets the test drives, and a network that answers pictures and `/api/me`
 * as the test says. A storage passed in is one kept by an earlier visit.
 */
function setup({ storage = memoryStorage(), online = true } = {}) {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    documentElement: { lang: "" },
  });
  const sockets: FakeSocket[] = [];
  const pictures: string[] = [];
  const net = {
    picture: async (): Promise<Response> => new Response("", { status: 200 }),
    me: async (): Promise<Response> => new Response("", { status: 401 }),
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", { onLine: online, languages: ["en"] });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("location", { origin: "https://chirashitabi.test" });
  vi.stubGlobal(
    "WebSocket",
    class extends FakeSocket {
      constructor(url: URL) {
        super(url);
        sockets.push(this);
      }
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/api/me")) return net.me();
      pictures.push(url);
      return net.picture();
    }),
  );

  const app = createApp({});
  const pinia = createPinia();
  app.use(pinia).use(PiniaColada);
  setActivePinia(pinia);
  const room = app.runWithContext(() => useRoom());
  const sync = app.runWithContext(() => useSync());
  const toast = app.runWithContext(() => useToast());
  const cache = app.runWithContext(() => useQueryCache());

  /** The page goes behind another app, or comes back to the front */
  function visibility(state: "hidden" | "visible") {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event("visibilitychange"));
  }
  return {
    storage,
    sockets,
    pictures,
    net,
    room,
    sync,
    toast,
    cache,
    visibility,
    pagehide: () => win.dispatchEvent(new Event("pagehide")),
    last: () => sockets.at(-1)!,
    /** What this device keeps of the room, its pending changes as their mutations */
    keptPending: (id = ROOM) => kept(storage, id)?.pending.map((p) => p.m),
  };
}

/** Connected to ROOM, in it as Yuki, with the snapshot kept */
function inRoom(options: Parameters<typeof setup>[0] = {}) {
  const t = setup(options);
  t.room.connect(ROOM);
  t.last().serve(snapshot());
  vi.advanceTimersByTime(400);
  return t;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connecting", () => {
  test("joins on the room's route, is in once the snapshot comes, and shows and keeps the room", () => {
    const t = setup();
    t.room.connect(ROOM);
    expect(t.sync.session).toMatchObject({ kind: "joining", room: ROOM });
    expect(t.last().url.href).toBe(`wss://chirashitabi.test/api/rooms/${ROOM}/ws`);

    t.last().serve(snapshot());
    expect(t.sync.session).toMatchObject({ kind: "in", room: ROOM, me: YUKI, link: "connected" });
    expect(t.cache.getQueryData(roomKeys.notes(ROOM))?.map((n) => n.id)).toEqual(["n1"]);
    expect(t.room.remembered()).toBe(ROOM);
    // kept a moment after the last change, not at once
    expect(kept(t.storage, ROOM)).toBeNull();
    vi.advanceTimersByTime(400);
    expect(kept(t.storage, ROOM)?.confirmed.notes.map((n) => n.id)).toEqual(["n1"]);
  });

  test("a room kept on this device opens in it at once, as who this device was there", () => {
    const { storage } = inRoom();
    const t = setup({ storage });
    t.room.connect(ROOM);
    expect(t.sync.session).toMatchObject({ kind: "in", room: ROOM, me: YUKI, link: "connecting" });
    expect(t.cache.getQueryData(roomKeys.notes(ROOM))?.map((n) => n.id)).toEqual(["n1"]);
  });

  test("a change made in the room is sent, and kept until the room answers it", () => {
    const t = inRoom();
    t.sync.commit(remove);
    const sent = t.last().sent.at(-1);
    expect(sent).toMatchObject(remove);
    t.pagehide();
    expect(t.keptPending()).toEqual([remove]);

    t.last().serve({ type: "ack", cid: sent?.cid, updatedAt: "2026-10-01T00:01:00Z" });
    t.pagehide();
    expect(t.keptPending()).toEqual([]);
  });

  test("the changes of one save are made all or none: one too large for a message stops them all", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = inRoom();
    const retitle: Mutation = { type: "note:update", id: remove.id, patch: { title: "Lunch" } };
    const huge: Mutation = {
      type: "note:update",
      id: remove.id,
      patch: { body: "x".repeat(70_000) },
    };
    const before = t.last().sent.length;
    expect(t.sync.commit(retitle, huge)).toBe(false);
    // none made, none sent, none kept; the person is told
    expect(t.cache.getQueryData(roomKeys.notes(ROOM))).toMatchObject([{ id: "n1", title: "n1" }]);
    expect(t.last().sent).toHaveLength(before);
    expect(t.toast.current?.text).toBe(
      "That change is too large to send, so it was not made. Try shortening it.",
    );
    t.pagehide();
    expect(t.keptPending()).toEqual([]);

    // the ones that fit are made together, and sent in order
    expect(t.sync.commit(retitle, remove)).toBe(true);
    expect(t.last().sent.slice(before)).toMatchObject([retitle, remove]);
  });

  test("before this device is in a room, a change is not made", () => {
    const t = setup();
    expect(t.sync.commit(remove)).toBe(false);
    // joining, before the room has said who this device is
    t.room.connect(ROOM);
    expect(t.sync.commit(remove)).toBe(false);
    expect(t.last().sent).toEqual([]);
  });
});

describe("keeping the room as the page goes", () => {
  test("pagehide puts through the delete the toast holds open, then keeps it unanswered", () => {
    const t = inRoom();
    let settled = 0;
    t.toast.show("deleted", {
      settle: () => {
        settled++;
        t.sync.commit(remove);
      },
      commits: remove,
    });
    t.pagehide();
    expect(settled).toBe(1);
    expect(t.toast.current).toBeNull();
    expect(t.last().sent).toEqual([expect.objectContaining(remove)]);
    expect(t.keptPending()).toEqual([remove]);
  });

  test("hidden, the delete the toast holds open is kept as made, but neither made nor sent", () => {
    const t = inRoom();
    let settled = 0;
    t.toast.show("deleted", { settle: () => settled++, commits: remove });
    t.visibility("hidden");
    expect(t.keptPending()).toEqual([remove]);
    expect(kept(t.storage, ROOM)?.pending[0]?.by).toBe(YUKI);
    expect(settled).toBe(0);
    expect(t.toast.current?.text).toBe("deleted");
    expect(t.last().sent).toEqual([]);
    expect(t.cache.getQueryData(roomKeys.notes(ROOM))?.map((n) => n.id)).toEqual(["n1"]);

    // back before the browser threw the page away: the undo still waits, and nothing is kept made
    t.visibility("visible");
    expect(t.keptPending()).toEqual([]);
    expect(t.toast.current?.text).toBe("deleted");
  });

  test("hidden with a toast that holds nothing open, the room is kept as it is", () => {
    const t = inRoom();
    t.toast.show("saved");
    t.visibility("hidden");
    expect(t.keptPending()).toEqual([]);
  });

  test("nothing is kept before this device is in the room", () => {
    const t = setup();
    t.room.connect(ROOM);
    t.visibility("hidden");
    t.pagehide();
    expect(kept(t.storage, ROOM)).toBeNull();
  });
});

describe("warming the room's pictures", () => {
  test("each picture is fetched once while the room is reachable, not on every change", () => {
    const t = inRoom();
    expect(t.pictures).toEqual([imageSrc(ROOM, PICTURE)]);
    t.last().serve({ type: "members", members: [yuki, ken] });
    expect(t.pictures).toHaveLength(1);
  });

  test("a picture that did not come is asked for again only after a while", async () => {
    const t = setup();
    t.net.picture = () => Promise.reject(new TypeError("offline"));
    t.room.connect(ROOM);
    t.last().serve(snapshot());
    await vi.advanceTimersByTimeAsync(0);
    expect(t.pictures).toHaveLength(1);

    t.last().serve({ type: "members", members: [yuki, ken] });
    expect(t.pictures).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    t.net.picture = async () => new Response("", { status: 200 });
    t.last().serve({ type: "members", members: [yuki] });
    expect(t.pictures).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    t.last().serve({ type: "members", members: [yuki, ken] });
    expect(t.pictures).toHaveLength(2);
  });

  test("offline, no picture is asked for", () => {
    const t = inRoom({ online: false });
    expect(t.pictures).toEqual([]);
  });
});

describe("coming back to the page", () => {
  /** Every try closes before the room says anything, until the socket gives up */
  function giveUp(t: ReturnType<typeof setup>) {
    for (let i = 0; i <= 8; i++) {
      t.last().drop();
      vi.advanceTimersByTime(30_000);
    }
  }

  test("after the socket gave up, it tries again at once", () => {
    const t = setup();
    t.room.connect(ROOM);
    giveUp(t);
    expect(t.sync.session).toMatchObject({ kind: "joining", link: "failed" });
    const tries = t.sockets.length;

    t.visibility("hidden");
    expect(t.sockets).toHaveLength(tries);
    t.visibility("visible");
    expect(t.sockets).toHaveLength(tries + 1);
    expect(t.sync.session).toMatchObject({ kind: "joining", link: "connecting" });
    t.last().serve(snapshot());
    expect(t.sync.session).toMatchObject({ kind: "in", link: "connected" });
  });

  test("while the socket is up, nothing is dialled again", () => {
    const t = inRoom();
    const tries = t.sockets.length;
    t.visibility("hidden");
    t.visibility("visible");
    expect(t.sockets).toHaveLength(tries);
  });
});

describe("who this device is signed in as", () => {
  test("what another person kept on this browser is not opened: the room joins afresh", async () => {
    const { storage } = inRoom();
    claim(storage, YUKI_MAIL);
    const t = setup({ storage });
    t.net.me = async () => mine(KEN_MAIL, [ROOM]);
    await t.room.check();
    expect(kept(storage, ROOM)).toBeNull();
    expect(t.room.remembered()).toBeNull();

    t.room.connect(ROOM);
    expect(t.sync.session).toMatchObject({ kind: "joining", room: ROOM });
    expect(t.cache.getQueryData(roomKeys.notes(ROOM))).toBeUndefined();
  });

  test("found out while open on what another person kept, the room is opened again as the room shows it", async () => {
    const { storage } = inRoom();
    claim(storage, YUKI_MAIL);
    const t = setup({ storage });
    t.room.connect(ROOM);
    expect(t.sync.session).toMatchObject({ kind: "in", me: YUKI });
    const first = t.last();

    t.net.me = async () => mine(KEN_MAIL, [ROOM]);
    await t.room.check();
    expect(first.closed).toBe(true);
    expect(t.sync.session).toMatchObject({ kind: "joining", room: ROOM });
    expect(t.last()).not.toBe(first);
    t.last().serve(snapshot(KEN));
    expect(t.sync.session).toMatchObject({ kind: "in", me: KEN });
  });

  test("the same person signed in again keeps what this device kept", async () => {
    const { storage } = inRoom();
    claim(storage, YUKI_MAIL);
    const t = setup({ storage });
    t.net.me = async () => mine(YUKI_MAIL, [ROOM]);
    await t.room.check();
    t.room.connect(ROOM);
    expect(t.sync.session).toMatchObject({ kind: "in", me: YUKI });
  });

  test("unanswered, everything kept stays", async () => {
    const { storage } = inRoom();
    claim(storage, YUKI_MAIL);
    const t = setup({ storage });
    await t.room.check();
    expect(kept(storage, ROOM)).not.toBeNull();
  });

  test("a room the person is no longer in puts this device out of it, and nothing of it stays", async () => {
    const t = inRoom();
    t.net.me = async () => mine(YUKI_MAIL, [OTHER_ROOM], [ROOM]);
    await t.room.check();
    expect(t.sync.session).toEqual({ kind: "out" });
    expect(t.room.gone).toEqual({ room: ROOM, reason: "deleted" });
    expect(kept(t.storage, ROOM)).toBeNull();
    expect(t.room.remembered()).toBeNull();
  });

  test("the room saying nothing to this device is what makes it ask", async () => {
    const t = inRoom();
    t.net.me = async () => mine(YUKI_MAIL, []);
    t.last().drop();
    vi.advanceTimersByTime(1000);
    t.last().drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.room.gone).toEqual({ room: ROOM, reason: "removed" });
  });
});
