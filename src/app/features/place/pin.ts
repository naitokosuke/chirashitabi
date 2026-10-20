import { PACKING_TAG, TODO_TAG, type Memo, type Note } from "../notes/types";

import type { LatLng, LngLat } from "./types";

export type Pinned<T extends Memo = Memo> = T & { pin: LatLng };

/** The memo with its place, for a flatMap, when it has one: so it can go on the map */
export const pinned = <T extends Memo>(n: T): Pinned<T>[] =>
  n.pin === null ? [] : [{ ...n, pin: n.pin }];

/** Every memo with a place */
export const pinnedOf = (notes: Note[]): Pinned[] =>
  notes.flatMap((n) => (n.kind === "memo" ? pinned(n) : []));

/** A memo that belongs on the map but has no place yet (packing notes and to-dos never do) */
export const needsPin = (n: Note) =>
  n.kind === "memo" &&
  !n.tags.includes(PACKING_TAG) &&
  !n.tags.includes(TODO_TAG) &&
  n.pin === null;

export const lngLat = (p: LatLng): LngLat => [p.lng, p.lat];
