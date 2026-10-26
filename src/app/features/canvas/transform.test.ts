import { describe, expect, test } from "vite-plus/test";

import {
  distance,
  fitView,
  pinchTo,
  startPinch,
  toWorld,
  tween,
  zoomAt,
  type Pt,
  type View,
} from "./transform";

const view: View = { tx: 100, ty: 50, s: 2 };
/** Where a point of the desk is on screen under `v`: the inverse of toWorld */
const toScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.s + v.tx, y: p.y * v.s + v.ty });

describe("toWorld", () => {
  test("takes the pan off, then the zoom", () => {
    expect(toWorld(view, 300, 250)).toEqual({ x: 100, y: 100 });
    expect(toWorld({ tx: 0, ty: 0, s: 1 }, 12, 34)).toEqual({ x: 12, y: 34 });
  });
});

describe("zoomAt", () => {
  test("the desk under the point zoomed at stays under it", () => {
    const before = toWorld(view, 400, 300);
    const after = zoomAt(view, 400, 300, 1.25);
    expect(after.s).toBe(2.5);
    expect(toWorld(after, 400, 300)).toEqual(before);
  });

  test("stops at a third of the size and at three times it, still around the point", () => {
    const out = zoomAt(view, 400, 300, 0.01);
    expect(out.s).toBe(0.3);
    expect(toWorld(out, 400, 300).x).toBeCloseTo(toWorld(view, 400, 300).x);
    expect(zoomAt(view, 400, 300, 100).s).toBe(3);
  });

  test("at the limit already, zooming further changes nothing", () => {
    const top: View = { tx: 10, ty: 20, s: 3 };
    expect(zoomAt(top, 400, 300, 2)).toEqual(top);
  });
});

describe("distance", () => {
  test("is the straight line between two points", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });
});

describe("pinching", () => {
  const a: Pt = { x: 100, y: 100 };
  const b: Pt = { x: 300, y: 100 };

  test("fingers that have not moved leave the view as it was", () => {
    expect(pinchTo(startPinch(view, a, b), a, b)).toEqual(view);
  });

  test("spread twice as far, the desk is twice as large around their midpoint", () => {
    const start = startPinch({ tx: 0, ty: 0, s: 1 }, a, b);
    const next = pinchTo(start, { x: 0, y: 100 }, { x: 400, y: 100 });
    expect(next.s).toBe(2);
    // the desk under the fingers' midpoint stays there
    expect(toWorld(next, 200, 100)).toEqual({ x: 200, y: 100 });
  });

  test("moved together, the desk moves with them", () => {
    const start = startPinch(view, a, b);
    const next = pinchTo(start, { x: 150, y: 130 }, { x: 350, y: 130 });
    expect(next).toEqual({ tx: view.tx + 50, ty: view.ty + 30, s: view.s });
  });

  test("the zoom stops at the same limits as the wheel's", () => {
    const start = startPinch({ tx: 0, ty: 0, s: 1 }, a, b);
    expect(pinchTo(start, { x: 199, y: 100 }, { x: 201, y: 100 }).s).toBe(0.3);
    expect(pinchTo(start, { x: -2000, y: 100 }, { x: 2000, y: 100 }).s).toBe(3);
  });
});

describe("fitView", () => {
  test("no cards, no view to fit them", () => {
    expect(fitView([], 1000, 800)).toBeNull();
  });

  test("a few cards are shown at their own size, the pile in the middle between the rows of buttons", () => {
    const fit = fitView([{ x: 0, y: 0 }], 1000, 800)!;
    expect(fit.s).toBe(1);
    // the card (220 × 160 with a margin of 30 around its corner) has its middle at the viewport's,
    // across, and down between the 52px of chips at the top and the 80px of buttons at the bottom
    expect(toScreen(fit, { x: 95, y: 65 })).toEqual({ x: 500, y: 52 + (800 - 52 - 80) / 2 });
  });

  test("a wide pile is drawn smaller until every card is inside", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3000, y: 500 },
    ];
    const fit = fitView(points, 1000, 800)!;
    expect(fit.s).toBeLessThan(1);
    const left = toScreen(fit, { x: -30, y: -30 });
    const right = toScreen(fit, { x: 3220, y: 660 });
    expect(left.x).toBeCloseTo(0);
    expect(right.x).toBeCloseTo(1000);
    expect(left.y).toBeGreaterThanOrEqual(52);
    expect(right.y).toBeLessThanOrEqual(800 - 80);
  });

  test("never below the smallest size asked for, nor below a third", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 30_000, y: 0 },
    ];
    expect(fitView(points, 1000, 800, 0.5)?.s).toBe(0.5);
    expect(fitView(points, 1000, 800)?.s).toBe(0.3);
  });
});

describe("tween", () => {
  const from: View = { tx: 0, ty: 0, s: 1 };
  const to: View = { tx: 100, ty: -200, s: 2 };

  test("starts at one view and ends at the other", () => {
    expect(tween(from, to, 0)).toEqual(from);
    expect(tween(from, to, 1)).toEqual(to);
  });

  test("eases out: most of the way is gone by halfway", () => {
    const half = tween(from, to, 0.5);
    expect(half.tx).toBe(87.5);
    expect(half.ty).toBe(-175);
    expect(half.s).toBe(1.875);
  });
});
