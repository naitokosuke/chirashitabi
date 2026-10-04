import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { MemberId } from "../members/types";
import type { Memo, NoteId } from "../notes/types";

import { createLedger, type RoomState } from "./ledger";
import type { Mutation } from "./types";

const ME = "yuki" as MemberId;
const KEN = "ken" as MemberId;
const t = (s: number) => Temporal.Instant.fromEpochMilliseconds(s * 1000);

const memo = (id: string, title: string): Memo => ({
  id: id as NoteId,
  kind: "memo",
  title,
  color: "#fff1b8",
  x: 0,
  y: 0,
  rot: 0,
  scale: 1,
  by: ME,
  updatedAt: t(0),
  body: "",
  tags: [],
  mapsUrl: null,
  pin: null,
  schedule: null,
  budget: null,
  checked: false,
  image: null,
});
const room = (...notes: Memo[]): RoomState => ({ notes, trip: null, members: [] });
const retitle = (id: string, title: string): Mutation => ({
  type: "note:update",
  id: id as NoteId,
  patch: { title },
});
const titles = (s: RoomState) => s.notes.map((n) => (n.kind === "memo" ? n.title : "?"));

describe("createLedger", () => {
  test("ours shows at once, and stays once the room acks it", () => {
    const l = createLedger();
    l.snapshot(room(memo("a", "A")));
    expect(titles(l.commit(retitle("a", "A1"), "c1", t(1), ME))).toEqual(["A1"]);
    expect(titles(l.ack("c1", t(2)))).toEqual(["A1"]);
    expect(l.pending).toEqual([]);
  });

  test("a rejection takes back only that change; a later one of ours stays", () => {
    const l = createLedger();
    l.snapshot(room(memo("a", "A"), memo("b", "B")));
    l.commit(retitle("a", "A1"), "c1", t(1), ME);
    l.commit(retitle("b", "B1"), "c2", t(1), ME);
    const { dropped, view } = l.reject("c1");
    expect(dropped?.cid).toBe("c1");
    expect(titles(view)).toEqual(["A", "B1"]);
  });

  test("a member's older change lands under ours until the room answers", () => {
    const l = createLedger();
    l.snapshot(room(memo("a", "A")));
    l.commit(retitle("a", "mine"), "c1", t(1), ME);
    // Ken's change was applied by the room first, and reaches us after we typed ours
    expect(titles(l.relayed(retitle("a", "ken's"), KEN, t(1)))).toEqual(["mine"]);
    // ours is applied after his, so it is what the room keeps
    expect(titles(l.ack("c1", t(2)))).toEqual(["mine"]);
  });

  test("a member's change elsewhere shows through ours", () => {
    const l = createLedger();
    l.snapshot(room(memo("a", "A"), memo("b", "B")));
    l.commit(retitle("a", "A1"), "c1", t(1), ME);
    expect(titles(l.relayed(retitle("b", "B-ken"), KEN, t(1)))).toEqual(["A1", "B-ken"]);
  });

  test("a snapshot after a reconnect keeps ours on top, to be sent again", () => {
    const l = createLedger();
    l.snapshot(room(memo("a", "A")));
    l.commit(retitle("a", "A1"), "c1", t(1), ME);
    expect(titles(l.snapshot(room(memo("a", "A-room"), memo("b", "B"))))).toEqual(["A1", "B"]);
    expect(l.pending.map((p) => p.cid)).toEqual(["c1"]);
  });

  test("an add the room already has, sent again and rejected as a duplicate, leaves the snapshot's", () => {
    const l = createLedger();
    l.snapshot(room());
    l.commit({ type: "note:add", note: memo("n", "N") }, "c1", t(1), ME);
    // the socket dropped before the ack; the room had applied it
    l.snapshot(room({ ...memo("n", "N"), updatedAt: t(2) }));
    const { view } = l.reject("c1");
    expect(titles(view)).toEqual(["N"]);
    expect(l.pending).toEqual([]);
  });

  test("an ack or rejection for a cid it does not know changes nothing", () => {
    const l = createLedger();
    const s = l.snapshot(room(memo("a", "A")));
    expect(l.ack("nope", t(1))).toBe(s);
    expect(l.reject("nope")).toEqual({ dropped: undefined, view: s });
  });

  test("with nothing pending, the view is the confirmed state itself", () => {
    const l = createLedger();
    const s = room(memo("a", "A"));
    expect(l.snapshot(s)).toBe(s);
  });

  test("who is in changes under ours: the notes and what is pending stay", () => {
    const l = createLedger();
    l.snapshot(room(memo("a", "A")));
    l.commit(retitle("a", "B"), "c1", t(1), ME);
    const ken = {
      id: KEN,
      kind: "person" as const,
      role: "guest" as const,
      name: "Ken",
      color: "#d7263d" as never,
    };
    const v = l.members([ken]);
    expect(v.members).toEqual([ken]);
    expect(v.notes.map((n) => n.title)).toEqual(["B"]);
    expect(l.confirmed.notes.map((n) => n.title)).toEqual(["A"]);
  });
});
