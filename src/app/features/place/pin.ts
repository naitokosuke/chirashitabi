import { PACKING_TAG, type Note } from "@/features/notes/types";

export type Pinned<T> = T & { lat: number; lng: number };

/** Has both coordinates, so it can go on the map */
export const isPinned = <T extends { lat?: number; lng?: number }>(p: T): p is Pinned<T> =>
  p.lat != null && p.lng != null;

/** A note that belongs on the map but has no place yet (packing notes never do) */
export const needsPin = (n: Note) =>
  n.kind === "note" && !n.tags.includes(PACKING_TAG) && !isPinned(n);

/** [lng, lat], the order GeoJSON and MapLibre want */
export const lngLat = (p: { lat: number; lng: number }): [number, number] => [p.lng, p.lat];
