import type { Temporal } from "temporal-polyfill-lite";
import type { LatLng } from "@/features/place/types";

export interface Day {
  date: Temporal.PlainDate;
  intro: string; // 2-3 lines written for the booklet, not a note
}

/** What the room knows about the trip itself */
export interface TripSnapshot {
  name: string; // the room name, e.g. "Taiwan trip"
  days: Day[];
  currency: string; // ISO 4217, for budgets: "TWD", "JPY", …
  center: LatLng; // where the map opens
}
