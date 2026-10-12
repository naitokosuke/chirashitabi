import { describe, expect, test } from "vite-plus/test";

import { airportsOf, findAirport, suggestAirports } from "./airports";

const airports = airportsOf([
  ["HND", "Tokyo Haneda International Airport", "Tokyo", "JP", 35.5497, 139.787],
  ["NRT", "Narita International Airport", "Narita", "JP", 35.7686, 140.3887],
  ["TPE", "Taiwan Taoyuan International Airport", "Taoyuan", "TW", 25.0777, 121.233],
  ["TSA", "Taipei Songshan International Airport", "Taipei (Songshan)", "TW", 25.0672, 121.5528],
  ["HNL", "Daniel K Inouye International Airport", "Honolulu", "US", 21.3187, -157.9225],
]);
const codes = (list: { code: string }[]) => list.map((a) => a.code);

describe("suggestAirports", () => {
  test("a code first, then codes it begins", () => {
    expect(codes(suggestAirports(airports, "tsa"))).toEqual(["TSA"]);
    expect(codes(suggestAirports(airports, "h"))).toEqual(["HND", "HNL"]);
  });

  test("a Japanese name, a name or a city finds it", () => {
    expect(codes(suggestAirports(airports, "羽田"))).toEqual(["HND"]);
    expect(codes(suggestAirports(airports, "桃園"))).toEqual(["TPE"]);
    expect(codes(suggestAirports(airports, "taipei"))).toEqual(["TSA"]);
    expect(codes(suggestAirports(airports, "Songshan"))).toEqual(["TSA"]);
  });

  test("among equals, an airport a trip from Japan often uses comes first", () => {
    // both are named "Taipei…": the one with a Japanese name comes first, wherever it is listed
    const other = airportsOf([["XXT", "Taipei Heliport", "Taipei", "TW", 25.0, 121.5]]);
    expect(codes(suggestAirports([...other, ...airports], "taipei"))).toEqual(["TSA", "XXT"]);
  });

  test("nothing typed, or nothing that fits, suggests nothing", () => {
    expect(suggestAirports(airports, " ")).toEqual([]);
    expect(suggestAirports(airports, "zzz")).toEqual([]);
  });
});

describe("findAirport", () => {
  test("a code in any case, a name as OurAirports writes it, or a Japanese name", () => {
    expect(findAirport(airports, " hnd ")?.at).toEqual({ lat: 35.5497, lng: 139.787 });
    expect(findAirport(airports, "narita international airport")?.code).toBe("NRT");
    expect(findAirport(airports, "松山")?.code).toBe("TSA");
  });

  test("anything else is no airport", () => {
    expect(findAirport(airports, "Tokyo")).toBeUndefined();
    expect(findAirport(airports, "")).toBeUndefined();
  });
});
