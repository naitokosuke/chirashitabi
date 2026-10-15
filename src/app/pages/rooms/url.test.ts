import { describe, expect, test } from "vite-plus/test";

import type { NoteId } from "../../features/notes/id";
import type { FormTarget } from "../../features/notes/types";

import { queryOf, sheetOf, viewOf } from "./url";

describe("sheetOf and queryOf", () => {
  test.each<[string, FormTarget]>([
    ["a sheet editing a note", { kind: "edit", id: "n1" as NoteId }],
    ["a sheet writing anywhere", { kind: "new", pin: null }],
    ["a sheet writing at a place", { kind: "new", pin: { lat: 25.03, lng: 121.56 } }],
  ])("%s goes to a query and comes back the same", (_, form) => {
    expect(sheetOf(queryOf(form))).toEqual(form);
  });

  test("no sheet, or an edit sheet with no note, is none", () => {
    expect(sheetOf({})).toBeNull();
    expect(sheetOf({ sheet: "edit" })).toBeNull();
    expect(sheetOf({ sheet: "edit", note: "" })).toBeNull();
  });

  test("a write sheet with half a place has no place", () => {
    expect(sheetOf({ sheet: "write", lat: 25 })).toEqual({ kind: "new", pin: null });
  });

  test("a key with no value, which the router hands over as null, is none", () => {
    const none = null as never;
    expect(sheetOf({ sheet: "write", lat: none, lng: 121 })).toEqual({ kind: "new", pin: null });
    expect(sheetOf({ sheet: "edit", note: none })).toBeNull();
  });
});

describe("viewOf", () => {
  test("a room's tab by its route's name; anything else is none", () => {
    expect(viewOf("/rooms/[roomId=roomId]/map")).toBe("map");
    expect(viewOf("/rooms/[roomId=roomId]/nope")).toBeNull();
    expect(viewOf("/")).toBeNull();
    expect(viewOf(undefined)).toBeNull();
  });
});
