import { describe, expect, test } from "vite-plus/test";

import {
  isShortMapsLink,
  parseMapsUrl,
  placeFromUrl,
  placeSearchLink,
  safeUrl,
} from "./google-maps";

describe("placeSearchLink", () => {
  test("searches the name at the point, and the point reads back as the pin", () => {
    const link = placeSearchLink("寧夏夜市", { lat: 25.0563, lng: 121.5154 });
    expect(link).toBe(
      "https://www.google.com/maps/search/%E5%AF%A7%E5%A4%8F%E5%A4%9C%E5%B8%82/@25.056300,121.515400,17z",
    );
    expect(parseMapsUrl(link)).toEqual({ lat: 25.0563, lng: 121.5154 });
    expect(safeUrl(link)).toBe(link);
  });

  test("a name with slashes or spaces stays one part of the path", () => {
    const link = placeSearchLink("A/B Café", { lat: -33.9, lng: 151.2 });
    expect(link).toContain("/search/A%2FB%20Caf%C3%A9/@-33.900000,151.200000,17z");
    // a whole degree too
    expect(parseMapsUrl(placeSearchLink("x", { lat: 25, lng: 121 }))).toEqual({
      lat: 25,
      lng: 121,
    });
    expect(parseMapsUrl(link)).toEqual({ lat: -33.9, lng: 151.2 });
  });
});

describe("parseMapsUrl and isShortMapsLink", () => {
  test("the point a shared short link leads to is read", () => {
    expect(parseMapsUrl("https://www.google.com/maps/search/25.0416,+121.5489?entry=tts")).toEqual({
      lat: 25.0416,
      lng: 121.5489,
    });
  });

  test("a short link is one Google Maps hands out to share, and only that", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/xyz")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/other")).toBe(false);
    expect(isShortMapsLink("https://www.google.com/maps/@25,121,15z")).toBe(false);
    expect(isShortMapsLink("javascript:alert(1)")).toBe(false);
  });
});

describe("placeFromUrl", () => {
  const pin = { lat: 1, lng: 2 };

  test("a link sets itself and the point it names; blank clears the link, the pin stays", () => {
    expect(placeFromUrl(" https://www.google.com/maps?q=25.04,121.55 ", pin)).toEqual({
      mapsUrl: "https://www.google.com/maps?q=25.04,121.55",
      pin: { lat: 25.04, lng: 121.55 },
    });
    expect(placeFromUrl("https://example.com/", pin)).toEqual({
      mapsUrl: "https://example.com/",
      pin,
    });
    expect(placeFromUrl("  ", pin)).toEqual({ mapsUrl: null, pin });
  });

  test("what is not a link a note may carry sets none, and the pin stays", () => {
    expect(placeFromUrl("Din Tai Fung", pin)).toEqual({ mapsUrl: null, pin });
    expect(placeFromUrl("javascript:alert(1)", pin)).toEqual({ mapsUrl: null, pin });
  });
});
