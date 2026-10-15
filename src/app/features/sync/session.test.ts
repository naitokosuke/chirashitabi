import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { MemberId, RoomId } from "../../../contract/ids";

import { linked, NO_ROOM, opened, OUT, roomOf, synced } from "./session";

const ROOM = "0d5f3c1e-6a4b-4c2d-9e8f-1a2b3c4d5e6f" as RoomId;
const ME = "yuki" as MemberId;
const at = Temporal.Instant.from("2026-11-03T03:00:00Z");

describe("session", () => {
  test("a room this device never kept is joined, and entered with the snapshot", () => {
    const s = opened(ROOM, null);
    expect(s).toEqual({ kind: "joining", room: ROOM, link: "connecting" });
    expect(synced(linked(s, "connected"), ME, at)).toEqual({
      kind: "in",
      room: ROOM,
      me: ME,
      syncedAt: at,
      link: "connected",
    });
  });

  test("a kept room is entered at once, as of when it was kept, while the socket connects", () => {
    expect(opened(ROOM, { me: ME, savedAt: at })).toEqual({
      kind: "in",
      room: ROOM,
      me: ME,
      syncedAt: at,
      link: "connecting",
    });
  });

  test("losing the socket keeps the room on screen; giving up keeps it too", () => {
    const s = opened(ROOM, { me: ME, savedAt: at });
    expect(linked(s, "reconnecting")).toMatchObject({ kind: "in", link: "reconnecting" });
    expect(linked(s, "failed")).toMatchObject({ kind: "in", link: "failed" });
  });

  test("out of a room nothing moves it in", () => {
    expect(linked(OUT, "connected")).toBe(OUT);
    expect(synced(OUT, ME, at)).toBe(OUT);
    expect(roomOf(OUT)).toBe(NO_ROOM);
  });
});
