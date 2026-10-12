import { shallowRef } from "vue";

import { airportsOf, type Airport } from "./airports";
import url from "./airports.json?url";

/** The airports, once fetched; shared by every view that asks */
const airports = shallowRef<Airport[]>([]);
let loading: Promise<void> | null = null;

/**
 * The airports (airports.ts), fetched the first time a view needs them (the trip's editor, the
 * map) and kept for the app's life: the file is about 110 KB on the wire, so nothing else waits
 * on it, and the service worker keeps it for the trip with no connection
 */
export function useAirports() {
  loading ??= fetch(url)
    .then((res): Promise<unknown> => res.json())
    .then((rows) => {
      airports.value = airportsOf(rows);
    })
    .catch(() => {
      // none: the flights keep their airports as written, and the map shows none of them
      loading = null;
    });
  return airports;
}
