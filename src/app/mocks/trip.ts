import { Temporal } from "temporal-polyfill-lite";

import { currencyCode } from "../shared/money";

import type { AirportCode } from "../features/place/airports";
import type { TripSnapshot } from "../features/trip/types";

const start = Temporal.PlainDate.from("2026-11-03");

export const mockTrip = (): TripSnapshot => ({
  name: "Taiwan trip",
  days: Array.from({ length: 4 }, (_, i) => ({ date: start.add({ days: i }), intro: "" })),
  currency: currencyCode("TWD")!,
  center: { lat: 25.05, lng: 121.54 }, // Taipei
  flights: {
    out: {
      number: "BR 191",
      // both on the list (airports.json), as the room would have checked
      from: "HND" as AirportCode,
      to: "TSA" as AirportCode,
      departs: Temporal.PlainDateTime.from("2026-11-03T08:50"),
      arrives: Temporal.PlainDateTime.from("2026-11-03T11:30"),
    },
    back: null,
  },
  stays: [
    {
      name: "Hotel Proverbs Taipei",
      checkIn: start,
      nights: 3,
      mapsUrl:
        "https://www.google.com/maps/search/Hotel%20Proverbs%20Taipei/@25.041600,121.548900,17z",
      pin: { lat: 25.0416, lng: 121.5489 },
    },
  ],
});
