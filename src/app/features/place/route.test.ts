import { describe, expect, test } from "vite-plus/test";

import { distanceKm, rideMinutes, WALKABLE_KM, walkMinutes, wayMinutes } from "./route";

describe("distanceKm and walkMinutes", () => {
  test("Taipei 101 to Din Tai Fung's main shop is about 3.5 km as the crow flies", () => {
    const km = distanceKm({ lat: 25.0339, lng: 121.5645 }, { lat: 25.0335, lng: 121.5301 });
    expect(km).toBeCloseTo(3.47, 1);
    expect(distanceKm({ lat: 25, lng: 121 }, { lat: 25, lng: 121 })).toBe(0);
  });

  test("a walk is the line made a third longer at 4.8 km an hour, at least a minute", () => {
    expect(walkMinutes(1)).toBe(16);
    expect(walkMinutes(0)).toBe(1);
  });
});

describe("rideMinutes and wayMinutes", () => {
  test("a ride is ten minutes to get going, then the line a third longer at 30 km an hour", () => {
    expect(rideMinutes(5)).toBe(23);
    expect(rideMinutes(0)).toBe(10);
  });

  test("the way is a walk while it is walkable, else a ride", () => {
    expect(wayMinutes(1)).toBe(walkMinutes(1));
    expect(wayMinutes(WALKABLE_KM)).toBe(rideMinutes(WALKABLE_KM));
  });
});
