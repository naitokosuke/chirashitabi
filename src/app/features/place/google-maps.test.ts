import { describe, expect, test } from "vite-plus/test";

import { safeUrl } from "../../../ui/index";

import {
  directionsLink,
  isMapsLink,
  isShortMapsLink,
  parseHttpUrl,
  parseMapsUrl,
  placeFromUrl,
  placeSearchLink,
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

  test("a place's link names the place's point, not where the map was looking", () => {
    expect(
      parseMapsUrl(
        "https://www.google.com/maps/place/x/@25.0330,121.5600,17z/data=!3m1!4b1!4m6!3m5!3d25.034!4d121.5645",
      ),
    ).toEqual({ lat: 25.034, lng: 121.5645 });
  });

  test("numbers off the map are no point, and the next pattern is tried", () => {
    expect(parseMapsUrl("https://www.google.com/maps/@999.1,999.2,15z")).toBeNull();
    expect(
      parseMapsUrl("https://www.google.com/maps/place/x/@25.05,121.51,15z/data=!3d999.1!4d999.2"),
    ).toEqual({ lat: 25.05, lng: 121.51 });
  });

  test("a short link is one Google Maps hands out to share, and only that", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/xyz")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/other")).toBe(false);
    expect(isShortMapsLink("https://www.google.com/maps/@25,121,15z")).toBe(false);
    expect(isShortMapsLink("javascript:alert(1)")).toBe(false);
  });
});

describe("isMapsLink", () => {
  const link = (s: string) => {
    const url = parseHttpUrl(s);
    if (url === null) throw new Error(s);
    return url;
  };

  test("a Google link is the place's, with a point or not, short or long", () => {
    expect(isMapsLink(link("https://maps.app.goo.gl/AbC123"))).toBe(true);
    expect(isMapsLink(link("https://www.google.com/maps/place/Taipei+101"))).toBe(true);
    expect(isMapsLink(link("https://www.google.co.jp/maps?q=25.03,121.56"))).toBe(true);
  });

  test("any other page is a page", () => {
    expect(isMapsLink(link("https://example.com/maps/@25.0x"))).toBe(false);
    expect(isMapsLink(link("https://notgoogle.com/maps"))).toBe(false);
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

describe("directionsLink", () => {
  const from = { lat: 25.0335, lng: 121.5301 };
  const to = { lat: 25.1094, lng: 121.8453 };

  test("asks Google for the way between the points, on foot or by public transport", () => {
    const transit = new URL(directionsLink(from, to, false));
    expect(transit.origin + transit.pathname).toBe("https://www.google.com/maps/dir/");
    expect(Object.fromEntries(transit.searchParams)).toEqual({
      api: "1",
      origin: "25.0335,121.5301",
      destination: "25.1094,121.8453",
      travelmode: "transit",
    });
    expect(new URL(directionsLink(from, to, true)).searchParams.get("travelmode")).toBe("walking");
  });
});
