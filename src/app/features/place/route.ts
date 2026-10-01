import type { FeatureCollection } from "geojson";

import type { Scheduled } from "../notes/types";

import { isPinned, lngLat } from "./pin";
import type { LngLat } from "./types";

/** The stops of a day's route, in order: everything with a place except the maybes */
export const routeStops = (notes: Scheduled[]): LngLat[] =>
  notes
    .filter((n) => n.schedule.status !== "idea")
    .filter(isPinned)
    .map((n) => lngLat(n.pin));

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
  if (points.length === 0) return null;
  const lngs = points.map((p) => p[0]),
    lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
