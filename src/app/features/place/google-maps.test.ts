import { describe, expect, test } from "vite-plus/test";

import { parseMapsUrl, placeSearchLink, safeUrl } from "./google-maps";

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
