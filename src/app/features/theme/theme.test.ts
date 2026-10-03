import { describe, expect, test } from "vite-plus/test";

import { coverRadius, other, parseTheme } from "./theme";

describe("parseTheme", () => {
  test.each([
    ["light", "light"],
    ["dark", "dark"],
    [null, null],
    ["sepia", null],
    ["", null],
  ] as const)("%s -> %s", (stored, theme) => {
    expect(parseTheme(stored)).toBe(theme);
  });
});

test("other", () => {
  expect(other("light")).toBe("dark");
  expect(other("dark")).toBe("light");
});

test("coverRadius reaches the farthest corner", () => {
  // from the bottom middle of a 400 × 800 screen, the top corners are farthest
  expect(coverRadius(200, 760, 400, 800)).toBeCloseTo(Math.hypot(200, 760));
  // from the centre, every corner is as far
  expect(coverRadius(50, 50, 100, 100)).toBeCloseTo(Math.hypot(50, 50));
});
