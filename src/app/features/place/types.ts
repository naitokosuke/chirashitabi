import type { LatLng } from "../../../contract/place";

// a point on the map, and what makes one, as the app takes them from the contract
export { LatLngSchema, type LatLng } from "../../../contract/place";

/** [lng, lat], the order GeoJSON and MapLibre want */
export type LngLat = [lng: number, lat: number];

/**
 * A place found by name (the Worker's geocoder): what it is called, where it is, its point, and
 * when it is open as OpenStreetMap writes it, when it says
 */
export interface FoundPlace {
  name: string;
  address: string;
  at: LatLng;
  hours: string | null;
}
