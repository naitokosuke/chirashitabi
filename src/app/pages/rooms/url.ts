import type { FormTarget, NoteId } from "../../features/notes/types";

/** A room's tabs, each a page under `pages/rooms/[roomId=roomId]/` */
export type View = "home" | "canvas" | "memo" | "map" | "shiori";
export const VIEWS: readonly View[] = ["home", "canvas", "memo", "map", "shiori"];

/** The tab a room's route is on, by its name (`/rooms/[roomId=roomId]/map`); null outside a room */
export function viewOf(name: unknown): View | null {
  if (typeof name !== "string") return null;
  return VIEWS.find((v) => name === `/rooms/[roomId=roomId]/${v}`) ?? null;
}

/** A route's query as strings only: a key given twice, or without a value, is not one */
export type Query = Record<string, string>;
export const queryStrings = (query: Record<string, unknown>): Query =>
  Object.fromEntries(
    Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string"),
  );

/** The sheet a room's URL has open over its tab, in the query, so going back closes it */
export function sheetOf(query: Query): FormTarget | null {
  if (query.sheet === "edit" && query.note !== undefined && query.note !== "")
    return { kind: "edit", id: query.note as NoteId };
  if (query.sheet !== "write") return null;
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const pinned =
    query.lat !== undefined &&
    query.lng !== undefined &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  return { kind: "new", pin: pinned ? { lat, lng } : null };
}

/** The query that opens a sheet on `form` */
export function queryOf(form: FormTarget): Query {
  if (form.kind === "edit") return { sheet: "edit", note: form.id };
  return form.pin === null
    ? { sheet: "write" }
    : { sheet: "write", lat: String(form.pin.lat), lng: String(form.pin.lng) };
}
