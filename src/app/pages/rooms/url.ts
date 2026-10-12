import type { RouteParams } from "vue-router";

import { isNoteId, type FormTarget } from "../../features/notes/types";

/** A room's tabs, each a page under `pages/rooms/[roomId=roomId]/` */
export type View = "home" | "canvas" | "memo" | "map" | "shiori";
export const VIEWS: readonly View[] = ["home", "canvas", "memo", "map", "shiori"];

/** The tab a room's route is on, by its name (`/rooms/[roomId=roomId]/map`); null outside a room */
export function viewOf(name: unknown): View | null {
  if (typeof name !== "string") return null;
  return VIEWS.find((v) => name === `/rooms/[roomId=roomId]/${v}`) ?? null;
}

/**
 * The sheet's part of a room's URL: its query, as the room's routes parse it (`definePage` in
 * `[roomId=roomId].vue`), each value the router could not read left out
 */
export type SheetQuery = Partial<Omit<RouteParams<"/rooms/[roomId=roomId]">, "roomId">>;

/**
 * The sheet a room's URL has open over its tab, in the query, so going back closes it. A key
 * given with no value (`?lat`) comes as null, whatever the types say, hence `typeof`.
 */
export function sheetOf(query: SheetQuery): FormTarget | null {
  const { sheet, note, lat, lng } = query;
  if (sheet === "edit" && isNoteId(note)) return { kind: "edit", id: note };
  if (sheet !== "write") return null;
  const pinned = typeof lat === "number" && typeof lng === "number";
  return { kind: "new", pin: pinned ? { lat, lng } : null };
}

/** The query that opens a sheet on `form` */
export function queryOf(form: FormTarget): SheetQuery {
  if (form.kind === "edit") return { sheet: "edit", note: form.id };
  return form.pin === null
    ? { sheet: "write" }
    : { sheet: "write", lat: form.pin.lat, lng: form.pin.lng };
}
