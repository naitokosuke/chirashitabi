import { describe, expect, test } from "vite-plus/test";

import { airportCodeOf, isAirportCode } from "./airports";

describe("the airports a room holds a flight to", () => {
  test("a code on the list, exactly as the app writes it", () => {
    expect(isAirportCode("HND")).toBe(true);
    expect(isAirportCode("TSA")).toBe(true);
    for (const bad of ["hnd", "ZZZ", "羽田", "", null, 42]) expect(isAirportCode(bad)).toBe(false);
  });

  test("a flight kept from before codes were required finds its code by any name it was given", () => {
    expect(airportCodeOf("hnd")).toBe("HND");
    expect(airportCodeOf("羽田")).toBe("HND");
    expect(airportCodeOf("Taipei Songshan International Airport")).toBe("TSA");
    expect(airportCodeOf("somewhere")).toBeNull();
  });
});
