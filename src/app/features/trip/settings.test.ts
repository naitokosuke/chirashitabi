import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { currencyCode } from "../../shared/money";

import { flightOf, formOf, newFlight, sameFlight, settingsOf } from "./settings";
import type { TripSnapshot } from "./types";

const first = Temporal.PlainDate.from("2026-11-03");
const out = {
  number: "BR 191",
  from: "HND",
  to: "TSA",
  departs: Temporal.PlainDateTime.from("2026-11-03T08:50"),
  arrives: Temporal.PlainDateTime.from("2026-11-03T11:30"),
};
const trip: TripSnapshot = {
  name: "Taiwan trip",
  days: [0, 1, 2, 3].map((i) => ({ date: first.add({ days: i }), intro: "" })),
  currency: currencyCode("TWD")!,
  center: { lat: 25, lng: 121 },
  flights: { out, back: null },
};

describe("formOf and settingsOf", () => {
  test("a trip goes into the inputs and comes back out as it was", () => {
    const form = formOf(trip);
    expect(form).toMatchObject({ name: "Taiwan trip", firstDay: "2026-11-03", days: 4 });
    expect(form.flights.out).toMatchObject({ on: true, departs: "2026-11-03T08:50" });
    expect(form.flights.back.on).toBe(false);
    const s = settingsOf(form);
    expect(s?.first.equals(first)).toBe(true);
    expect(sameFlight(s!.flights.out, out)).toBe(true);
    expect(s?.flights.back).toBeNull();
  });

  test("a blank name, a day that is not one, or a half-written flight is not taken", () => {
    const form = formOf(trip);
    expect(settingsOf({ ...form, name: "  " })).toBeNull();
    expect(settingsOf({ ...form, firstDay: "" })).toBeNull();
    expect(settingsOf({ ...form, days: 0 })).toBeNull();
    const half = { ...newFlight("back", first, 4), from: "TSA" };
    expect(settingsOf({ ...form, flights: { ...form.flights, back: half } })).toBeNull();
  });
});

describe("newFlight and flightOf", () => {
  test("the way there leaves on the first day, the way home on the last", () => {
    expect(newFlight("out", first, 4).departs).toBe("2026-11-03T09:00");
    expect(newFlight("back", first, 4).departs).toBe("2026-11-06T17:00");
  });

  test("a flight that is off is none; one with its places and times is taken, trimmed", () => {
    expect(flightOf({ ...newFlight("out", first, 1), on: false })).toBeNull();
    const f = flightOf({
      ...newFlight("out", first, 1),
      number: " CI 223 ",
      from: " HND",
      to: "TSA ",
    });
    expect(f).toMatchObject({ number: "CI 223", from: "HND", to: "TSA" });
  });
});
