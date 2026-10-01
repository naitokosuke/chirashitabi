import type { Temporal } from "temporal-polyfill-lite";

import type { CurrencyCode } from "../../shared/money";

import type { LatLng } from "../place/types";

export interface Day {
  date: Temporal.PlainDate;
  intro: string; // 2-3 lines written for the booklet, not a note
}

/** What the room knows about the trip itself */
export interface TripSnapshot {
  name: string; // the room name, e.g. "Taiwan trip"
  days: Day[];
  currency: CurrencyCode; // what every budget is in
  center: LatLng; // where the map opens
}
