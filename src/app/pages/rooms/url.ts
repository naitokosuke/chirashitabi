import * as v from "valibot";
import type { RouteParams } from "vue-router";

import { parseNoteId } from "../../features/notes/id";
import { type FormTarget } from "../../features/notes/types";
import { LatLngSchema } from "../../features/place/types";

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
 * given with no value (`?lat`) comes as null, whatever the types say; the place is read as a
 * point on the map, so that and a number off the map are none.
 */
export function sheetOf(query: SheetQuery): FormTarget | null {
  const { sheet, note, lat, lng } = query;
  const id = sheet === "edit" ? parseNoteId(note) : null;
  if (id !== null) return { kind: "edit", id };
  if (sheet !== "write") return null;
  const pin = v.safeParse(LatLngSchema, { lat, lng });
  return { kind: "new", pin: pin.success ? pin.output : null };
}

/** The query that opens a sheet on `form` */
export function queryOf(form: FormTarget): SheetQuery {
  if (form.kind === "edit") return { sheet: "edit", note: form.id };
  return form.pin === null
    ? { sheet: "write" }
    : { sheet: "write", lat: form.pin.lat, lng: form.pin.lng };
}
