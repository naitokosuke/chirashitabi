import { describe, expect, test } from "vite-plus/test";

import { axisOf, resist, settlesOpen } from "./swipe";

describe("axisOf", () => {
  test("says nothing inside the slop", () => {
    expect(axisOf(5, 5)).toBeNull();
  });
  test("a mostly sideways move slides the row", () => {
    expect(axisOf(-12, 4)).toBe("x");
  });
  test("a mostly upright move scrolls the list", () => {
    expect(axisOf(-6, 10)).toBe("y");
  });
});

describe("resist", () => {
  test("follows the finger between closed and open", () => {
    expect(resist(-40, 96)).toBe(-40);
  });
  test("stays closed when pushed the other way", () => {
    expect(resist(30, 96)).toBe(0);
  });
  test("pulls back past open", () => {
    expect(resist(-196, 96)).toBe(-126);
  });
});

describe("settlesOpen", () => {
  test("past half the actions, it opens", () => {
    expect(settlesOpen(-60, 96, 0)).toBe(true);
  });
  test("short of half, it closes", () => {
    expect(settlesOpen(-30, 96, 0)).toBe(false);
  });
  test("a flick to the left opens it from anywhere", () => {
    expect(settlesOpen(-10, 96, -0.5)).toBe(true);
  });
  test("a flick back closes it from anywhere", () => {
    expect(settlesOpen(-90, 96, 0.5)).toBe(false);
  });
});
