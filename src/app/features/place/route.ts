import type { FeatureCollection } from "geojson";

import type { Scheduled } from "../notes/types";

import { isPinned, lngLat } from "./pin";
import type { LatLng, LngLat } from "./types";

/** The stops of a day's route, in order: everything with a place except the maybes */
export const routeStops = (notes: Scheduled[]): LngLat[] =>
  notes
    .filter((n) => n.schedule.status !== "idea")
    .filter(isPinned)
    .map((n) => lngLat(n.pin));

/**
 * A day's stops, leaving from where its night before was spent and back to where its night is,
 * when the trip knows where those are; a day with no stops of its own goes nowhere
 */
export function dayStops(notes: Scheduled[], from: LatLng | null, to: LatLng | null): LngLat[] {
  const stops = routeStops(notes);
  if (stops.length === 0) return [];
  return [...(from === null ? [] : [lngLat(from)]), ...stops, ...(to === null ? [] : [lngLat(to)])];
}

/** How far apart two points are, in kilometres, as the crow flies */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Farther than this, a leg is said in kilometres rather than minutes on foot */
export const WALKABLE_KM = 1.5;
/**
 * Minutes on foot for a straight line of `km`: streets wind (a third longer than the line) and
 * a person walks about 4.8 km an hour; a guess to plan by, never less than a minute
 */
export const walkMinutes = (km: number) => Math.max(1, Math.round(((km * 1.3) / 4.8) * 60));

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
