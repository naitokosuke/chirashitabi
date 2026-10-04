import { describe, expect, test } from "vite-plus/test";

import type { NoteId } from "./features/notes/types";
import { queryOf, queryStrings, sheetOf, viewOf, type FormTarget } from "./shell";

describe("sheetOf and queryOf", () => {
  test.each<[string, FormTarget]>([
    ["a sheet editing a note", { kind: "edit", id: "n1" as NoteId }],
    ["a sheet writing anywhere", { kind: "new", pin: null }],
    ["a sheet writing at a place", { kind: "new", pin: { lat: 25.03, lng: 121.56 } }],
  ])("%s goes to a query and comes back the same", (_, form) => {
    expect(sheetOf(queryOf(form))).toEqual(form);
  });

  test("no sheet, or one it does not know, is none", () => {
    expect(sheetOf({})).toBeNull();
    expect(sheetOf({ sheet: "nope" })).toBeNull();
    expect(sheetOf({ sheet: "edit" })).toBeNull();
  });

  test("a write sheet with half a place has no place", () => {
    expect(sheetOf({ sheet: "write", lat: "25" })).toEqual({ kind: "new", pin: null });
  });

  test("a key given twice is not read", () => {
    expect(queryStrings({ sheet: ["write", "edit"], note: "n1" })).toEqual({ note: "n1" });
  });
});

describe("viewOf", () => {
  test("a room's tab by its route's name; anything else is none", () => {
    expect(viewOf("/rooms/[roomId]/map")).toBe("map");
    expect(viewOf("/rooms/[roomId]/nope")).toBeNull();
    expect(viewOf("/")).toBeNull();
    expect(viewOf(undefined)).toBeNull();
  });
});
