import { Temporal } from "temporal-polyfill-lite";

import { createApp } from "vue";

import { createPinia, setActivePinia } from "pinia";

import { PiniaColada } from "@pinia/colada";
import { expect, test } from "vite-plus/test";

import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

import type { TripChanges } from "./settings";
import { useTrip } from "./useTrip";

test("a save of the trip's settings is committed as one, whether it was made said back", () => {
  const app = createApp({});
  const pinia = createPinia();
  app.use(pinia).use(PiniaColada);
  setActivePinia(pinia);
  const commits: Mutation[][] = [];
  let takes = false;
  useSync().transport = {
    commit: (...ms) => commits.push(ms) > 0 && takes,
    send: () => {},
  };
  const trip = app.runWithContext(() => useTrip());
  const changes: TripChanges = {
    name: "Taipei",
    dates: { first: Temporal.PlainDate.from("2026-11-01"), days: 4 },
    flights: [{ leg: "out", flight: null }],
    stays: [],
  };

  expect(trip.save(changes)).toBe(false);
  takes = true;
  expect(trip.save(changes)).toBe(true);
  expect(commits.map((ms) => ms.map((m) => m.type))).toEqual([
    ["trip:rename", "trip:dates", "trip:flight", "trip:stays"],
    ["trip:rename", "trip:dates", "trip:flight", "trip:stays"],
  ]);
});
