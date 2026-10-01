/** A point on the map. Always both halves: a latitude alone is not a place */
export interface LatLng {
  lat: number;
  lng: number;
}

/** [lng, lat], the order GeoJSON and MapLibre want */
export type LngLat = [lng: number, lat: number];
