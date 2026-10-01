import { Temporal } from "temporal-polyfill-lite";

import { currencyCode } from "../shared/money";

import type { TripSnapshot } from "../features/trip/types";

const start = Temporal.PlainDate.from("2026-11-03");

export const mockTrip = (): TripSnapshot => ({
  name: "Taiwan trip",
  days: Array.from({ length: 4 }, (_, i) => ({ date: start.add({ days: i }), intro: "" })),
  currency: currencyCode("TWD")!,
  center: { lat: 25.05, lng: 121.54 }, // Taipei
});
