/** A point on the map. Always both halves: a latitude alone is not a place */
export interface LatLng {
  lat: number;
  lng: number;
}

/** [lng, lat], the order GeoJSON and MapLibre want */
export type LngLat = [lng: number, lat: number];

/** A place found by name (the Worker's geocoder): what it is called, where it is, its point */
export interface FoundPlace {
  name: string;
  address: string;
  at: LatLng;
}
