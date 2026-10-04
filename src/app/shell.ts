import type { NoteId } from "./features/notes/types";
import type { LatLng } from "./features/place/types";
import { roomId, type RoomId } from "./features/rooms/types";
export type View = "home" | "canvas" | "memo" | "map" | "shiori";
export const VIEWS: readonly View[] = ["home", "canvas", "memo", "map", "shiori"];

/**
 * What a sheet is open on: a new memo (pinned when written from the map), or an existing one,
 * by id, so the form always edits the memo as it is now
 */
export type FormTarget = { kind: "new"; pin: LatLng | null } | { kind: "edit"; id: NoteId };

/** Everything the shell shows in a room: the tab that is up, and the form sheet over it (closed, or open on a target) */
export type AppState = { tab: View; form: FormTarget | null };

/** What can happen to the shell */
export type AppEvent =
  | { type: "tabSelected"; tab: View }
  | { type: "writeRequested" }
  | { type: "writeAtPinRequested"; pin: LatLng | null } // null: from the map's write button, no place yet
  | { type: "editRequested"; id: NoteId }
  | { type: "formClosed" };

export const initialState: AppState = { tab: "canvas", form: null };

/** The state after an event; pure, so effects such as placing a memo stay with the caller */
export function next(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    // the tab bar stays live over the sheet: picking a tab puts the sheet away and goes there
    case "tabSelected":
      return { tab: event.tab, form: null };
    case "writeRequested":
      return { ...state, form: { kind: "new", pin: null } };
    case "writeAtPinRequested":
      return { ...state, form: { kind: "new", pin: event.pin } };
    case "editRequested":
      return { ...state, form: { kind: "edit", id: event.id } };
    case "formClosed":
      return { ...state, form: null };
  }
}

/**
 * Where the app is, which the URL says (router.ts): the person's trips, a new one being made,
 * or inside a room, on a tab, with a sheet over it or not. So a link, a reload or the back
 * button lands where it should.
 */
export type Place =
  | { kind: "rooms" }
  | { kind: "new" }
  | { kind: "room"; room: RoomId; state: AppState };

/** A URL as the router hands it over: a path and its query */
export interface Location {
  path: string;
  query: Record<string, string>;
}

const ROOM_PATH = /^\/rooms\/([0-9a-f-]{36})(?:\/([a-z]+))?\/?$/;

/** The place a URL names; anything it cannot read is the person's trips */
export function placeOf({ path, query }: Location): Place {
  if (path === "/new") return { kind: "new" };
  const m = ROOM_PATH.exec(path);
  const room = roomId(m?.[1]);
  if (m === null || room === null) return { kind: "rooms" };
  const tab = (VIEWS as readonly string[]).includes(m[2] ?? "") ? (m[2] as View) : "canvas";
  return { kind: "room", room, state: { tab, form: sheetOf(query) } };
}

/** The URL of a place: a sheet is in the query, so going back closes it */
export function locationOf(place: Place): Location {
  if (place.kind === "rooms") return { path: "/", query: {} };
  if (place.kind === "new") return { path: "/new", query: {} };
  const { tab, form } = place.state;
  return { path: `/rooms/${place.room}/${tab}`, query: form === null ? {} : queryOf(form) };
}

function sheetOf(query: Record<string, string>): FormTarget | null {
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

function queryOf(form: FormTarget): Record<string, string> {
  if (form.kind === "edit") return { sheet: "edit", note: form.id };
  return form.pin === null
    ? { sheet: "write" }
    : { sheet: "write", lat: String(form.pin.lat), lng: String(form.pin.lng) };
}
