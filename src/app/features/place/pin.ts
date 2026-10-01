import { PACKING_TAG, type Memo, type Note } from "@/features/notes/types";
import type { LatLng } from "./types";

export type Pinned<T extends Memo = Memo> = T & { pin: LatLng };

/** Has a place, so it can go on the map */
export const isPinned = <T extends Memo>(n: T): n is Pinned<T> => n.pin !== null;

/** Every memo with a place */
export const pinnedOf = (notes: Note[]): Pinned[] =>
  notes.filter((n): n is Pinned => n.kind === "memo" && isPinned(n));

/** A memo that belongs on the map but has no place yet (packing notes never do) */
export const needsPin = (n: Note) =>
  n.kind === "memo" && !n.tags.includes(PACKING_TAG) && !isPinned(n);

/** [lng, lat], the order GeoJSON and MapLibre want */
export const lngLat = (p: LatLng): [number, number] => [p.lng, p.lat];
