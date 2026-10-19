import { describe, expect, test } from "vite-plus/test";

import { dotOf, magnification, restOf, type Measured } from "./dock";

const CELL = 40;
/** Icons at rest, side by side from 100: their middles at 120, 160, 200 */
const atRest: Measured[] = [120, 160, 200].map((x) => ({ x, width: CELL }));
/**
 * The same icons with the middle one grown by 20: the box, centred, has moved back by 10, so
 * the first is at 110; the middle one, 10 wider each side, is where it was; the last is
 * pushed along by 20 less the 10
 */
const grown: Measured[] = [
  { x: 110, width: CELL },
  { x: 160, width: CELL + 20 },
  { x: 210, width: CELL },
];

describe("restOf", () => {
  test("icons at rest rest where they are", () => {
    expect(restOf(atRest, CELL)).toEqual([120, 160, 200]);
  });
  test("finds where grown icons rest", () => {
    expect(restOf(grown, CELL)).toEqual([120, 160, 200]);
  });
  test("none is none", () => {
    expect(restOf([], CELL)).toEqual([]);
  });
});

describe("magnification", () => {
  test("the icon under the pointer grows the most", () => {
    expect(magnification(0)).toBeCloseTo(1.55);
  });
  test("one out of reach does not grow, either way", () => {
    expect(magnification(120)).toBe(1);
    expect(magnification(-300)).toBe(1);
  });
  test("between, it is a soft shoulder, not a cone", () => {
    expect(magnification(60)).toBeCloseTo(1.275);
    expect(magnification(30)).toBeGreaterThan(1.275);
    expect(magnification(90)).toBeLessThan(1.275);
  });
});

describe("dotOf", () => {
  const box = { x: 160, width: 160 };
  test("sits under where the open icon rests, from the box's middle", () => {
    expect(dotOf(restOf(atRest, CELL), 2, box)).toBe(40);
    expect(dotOf(restOf(grown, CELL), 2, box)).toBe(40);
  });
  test("is nowhere with nothing open", () => {
    expect(dotOf(restOf(atRest, CELL), -1, box)).toBeNull();
  });
});
