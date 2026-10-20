import type { Temporal } from "temporal-polyfill-lite";

import type { CurrencyCode } from "../../shared/money";

import type { Leg } from "../../../contract/wire";
import type { AirportCode } from "../place/airports";
import type { HttpUrl } from "../place/google-maps";
import type { LatLng } from "../place/types";

// which flight, the one there or the one home, as the app takes it from the contract
export type { Leg } from "../../../contract/wire";

/** Both flights, the way there first (a value from contract/wire.ts would bring its checks into the bundle) */
export const LEGS = ["out", "back"] as const satisfies readonly Leg[];

export interface Day {
  date: Temporal.PlainDate;
  intro: string; // 2-3 lines written for the booklet, not a note
}

/**
 * A flight as written from the ticket: where it leaves from and lands (airports on the list), its
 * number (may be blank), and when, each in its own airport's local time; null while the times
 * are not known, when the way there is taken to be on the first day and the way home the last.
 */
export interface Flight {
  number: string;
  from: AirportCode;
  to: AirportCode;
  departs: Temporal.PlainDateTime | null;
  arrives: Temporal.PlainDateTime | null;
}

export type Flights = Record<Leg, Flight | null>;

/**
 * Where the nights are spent: its name, the first night and how many, and where it is when a
 * Google Maps link said so. A day's plan leaves from where its night before was spent.
 */
export type Stay = {
  name: string;
  checkIn: Temporal.PlainDate;
  nights: number;
} & ({ mapsUrl: null; pin: null } | { mapsUrl: HttpUrl; pin: LatLng | null });

/** What the room knows about the trip itself */
export interface TripSnapshot {
  name: string; // the room name, e.g. "Taiwan trip"
  days: Day[];
  currency: CurrencyCode; // what every budget is in
  center: LatLng; // where the map opens
  flights: Flights;
  /** In the order they come */
  stays: Stay[];
}
