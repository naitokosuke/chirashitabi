/**
 * The dock's geometry (CtDock). The icons sit in a row in a box centred on the screen; under a
 * mouse an icon grows wider (`width: cell * m`), pushing those after it along, and the box,
 * centred, moves back by half of all the growth. Everything here is worked out from where
 * the icons are now, so it is right mid-growth and mid-spring, and nothing has to be measured
 * at rest.
 */

/** An icon as measured: the middle of it on screen, and how wide it is now */
export type Measured = { x: number; width: number };

/** How far a pointer reaches, and how much the icon under it grows */
export const REACH = 120;
export const GROW = 0.55;

/**
 * Where each icon's middle rests, from where the icons are now: take back the growth of the
 * ones before it, half its own, and give back the half of all growth the box moved by.
 */
export function restOf(items: readonly Measured[], cell: number): number[] {
  const growth = items.map((i) => i.width - cell);
  const total = growth.reduce((a, g) => a + g, 0);
  let before = 0;
  return items.map((item, i) => {
    const g = growth[i] ?? 0;
    const rest = item.x - before - g / 2 + total / 2;
    before += g;
    return rest;
  });
}

/** How much an icon grows, by how far the pointer is from where it rests: a soft shoulder */
export function magnification(distance: number): number {
  const t = Math.max(0, 1 - Math.abs(distance) / REACH);
  return 1 + GROW * t * t * (3 - 2 * t);
}

/**
 * Where the dot sits, from the middle of the box: under where the open icon rests. The box
 * is centred, so its middle stays put while icons grow, and so does the dot.
 */
export function dotOf(rest: readonly number[], current: number, box: Measured): number | null {
  const x = rest[current];
  return x === undefined ? null : x - box.x;
}
