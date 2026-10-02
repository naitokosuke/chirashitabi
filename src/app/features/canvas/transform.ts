/** Screen <-> world transform. world = (screen - t) / s */
export interface View {
  tx: number;
  ty: number;
  s: number;
}
export interface Pt {
  x: number;
  y: number;
}

export const clampScale = (s: number) => Math.min(3, Math.max(0.3, s));

export const toWorld = (view: View, sx: number, sy: number): Pt => ({
  x: (sx - view.tx) / view.s,
  y: (sy - view.ty) / view.s,
});

/** Scale by `factor` while the screen point (sx, sy) stays put */
export function zoomAt(view: View, sx: number, sy: number, factor: number): View {
  const s = clampScale(view.s * factor),
    k = s / view.s;
  return { tx: sx - (sx - view.tx) * k, ty: sy - (sy - view.ty) * k, s };
}

export const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Where two fingers first landed, and the view at that moment */
export interface PinchStart extends View {
  dist: number;
  mid: Pt;
}
export const startPinch = (view: View, a: Pt, b: Pt): PinchStart => ({
  ...view,
  dist: distance(a, b),
  mid: midpoint(a, b),
});
/** Follow the fingers: scale by how far they spread, move with their midpoint */
export function pinchTo(start: PinchStart, a: Pt, b: Pt): View {
  const mid = midpoint(a, b);
  const s = clampScale((start.s * distance(a, b)) / start.dist),
    k = s / start.s;
  return { tx: mid.x - (start.mid.x - start.tx) * k, ty: mid.y - (start.mid.y - start.ty) * k, s };
}

/** A view that shows every card (top-left corners at `points`) inside a width × height viewport */
export function fitView(points: Pt[], width: number, height: number, minScale = 0): View | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - 30,
    maxX = Math.max(...xs) + 220,
    minY = Math.min(...ys) - 30,
    maxY = Math.max(...ys) + 160;
  // below `minScale` the cards would be too small to read: stop there, centered on the pile
  const s = clampScale(
    Math.max(minScale, Math.min(width / (maxX - minX), (height - 200) / (maxY - minY))),
  );
  return {
    tx: (width - (maxX + minX) * s) / 2,
    ty: 120 + (height - 200 - (maxY + minY) * s) / 2,
    s,
  };
}

/** `p` of the way from one view to another (0..1), easing out */
export function tween(from: View, to: View, p: number): View {
  const e = 1 - Math.pow(1 - p, 3);
  return {
    tx: from.tx + (to.tx - from.tx) * e,
    ty: from.ty + (to.ty - from.ty) * e,
    s: from.s + (to.s - from.s) * e,
  };
}
