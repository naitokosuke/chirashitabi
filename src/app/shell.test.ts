import { describe, expect, test } from "vite-plus/test";

import type { NoteId } from "./features/notes/types";
import type { RoomId } from "./features/rooms/types";
import { initialState, locationOf, next, placeOf, type Place } from "./shell";

const ROOM = "0d5f3c1e-6a4b-4c2d-9e8f-1a2b3c4d5e6f" as RoomId;
const at = (path: string, query: Record<string, string> = {}) => placeOf({ path, query });

describe("placeOf and locationOf", () => {
  test.each<[string, Place]>([
    ["the trips", { kind: "rooms" }],
    ["a new trip", { kind: "new" }],
    ["a room's tab", { kind: "room", room: ROOM, state: { tab: "map", form: null } }],
    [
      "a sheet editing a note",
      {
        kind: "room",
        room: ROOM,
        state: { tab: "canvas", form: { kind: "edit", id: "n1" as NoteId } },
      },
    ],
    [
      "a sheet writing at a place",
      {
        kind: "room",
        room: ROOM,
        state: { tab: "map", form: { kind: "new", pin: { lat: 25.03, lng: 121.56 } } },
      },
    ],
  ])("%s goes to a URL and comes back the same", (_, place) => {
    expect(placeOf(locationOf(place))).toEqual(place);
  });

  test("a room without a tab opens on the canvas; one with a tab it does not know, too", () => {
    expect(at(`/r/${ROOM}`)).toMatchObject({ state: { tab: "canvas" } });
    expect(at(`/r/${ROOM}/nope`)).toMatchObject({ state: { tab: "canvas" } });
  });

  test("what is not a place is the trips", () => {
    expect(at("/r/not-a-room/map")).toEqual({ kind: "rooms" });
    expect(at("/somewhere")).toEqual({ kind: "rooms" });
  });

  test("a write sheet with half a place has no place", () => {
    expect(at(`/r/${ROOM}/map`, { sheet: "write", lat: "25" })).toMatchObject({
      state: { form: { kind: "new", pin: null } },
    });
  });
});

describe("next", () => {
  test("picking a tab puts the sheet away", () => {
    const open = next(initialState, { type: "writeRequested" });
    expect(next(open, { type: "tabSelected", tab: "home" })).toEqual({ tab: "home", form: null });
  });
});
