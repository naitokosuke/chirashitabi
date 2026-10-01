import type { FeatureCollection } from "geojson";
import type { Note } from "@/features/notes/types";
import { isPinned, lngLat, type Pinned } from "./pin";

type LngLat = [number, number];

/** The stops of a day's route, in order: everything with a place except the maybes */
export const routeStops = (notes: Note[]): LngLat[] =>
  notes.filter((n): n is Pinned<Note> => n.status !== "idea" && isPinned(n)).map(lngLat);

/** A line through the stops, or nothing while there are fewer than two */
export const routeLine = (stops: LngLat[]): FeatureCollection => ({
  type: "FeatureCollection",
  features:
    stops.length > 1
      ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: stops } }]
      : [],
});

/** [[west, south], [east, north]] around the points, or null when there are none */
export function boundsOf(points: LngLat[]): [LngLat, LngLat] | null {
  if (!points.length) return null;
  const lngs = points.map((p) => p[0]),
    lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
