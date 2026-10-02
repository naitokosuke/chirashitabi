import { describe, expect, test } from "vite-plus/test";

import { tagSpot } from "./transform";

describe("tagSpot", () => {
  test("centred over the pile, hanging above its top edge", () => {
    const spot = tagSpot(
      [
        { x: 40, y: 40 },
        { x: 500, y: 240 },
      ],
      { x: 0, y: 0 },
    );
    // the pile spans 40 to 500 + a card's 164
    expect(spot).toEqual({ x: (40 + 664) / 2, y: 40 - 64 });
  });

  test("an empty desk hangs it above where the first card will land", () => {
    expect(tagSpot([], { x: 82, y: 60 })).toEqual({ x: 82, y: 60 - 104 });
  });
});
