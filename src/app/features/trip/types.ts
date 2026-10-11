import type { Temporal } from "temporal-polyfill-lite";

import type { CurrencyCode } from "../../shared/money";

import type { LatLng } from "../place/types";

export interface Day {
  date: Temporal.PlainDate;
  intro: string; // 2-3 lines written for the booklet, not a note
}

/** Which flight: the one there, or the one home */
export type Leg = "out" | "back";

/**
 * A flight as written from the ticket: its number (may be blank), where it leaves from and
 * lands (a code or a name), and when, each in its own airport's local time.
 */
export interface Flight {
  number: string;
  from: string;
  to: string;
  departs: Temporal.PlainDateTime;
  arrives: Temporal.PlainDateTime;
}

export type Flights = Record<Leg, Flight | null>;

/**
 * Where the nights are spent: its name, the first night and how many, and where it is when a
 * Google Maps link said so. A day's plan leaves from where its night before was spent.
 */
export interface Stay {
  name: string;
  checkIn: Temporal.PlainDate;
  nights: number;
  mapsUrl: string | null;
  pin: LatLng | null;
}

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
