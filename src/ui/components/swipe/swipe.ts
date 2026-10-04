/**
 * The math of a row slid aside to show its actions, as a phone's list does (iOS's trailing swipe
 * actions, Ionic's `ion-item-sliding`). An offset is in px, negative to the left: the row goes
 * left and the actions, `width` wide, show at its right end.
 */

/** How far a finger moves before the row knows whether it is being slid or scrolled */
export const SLOP = 8;
/** A flick at least this fast (px/ms) opens or closes the row whatever the distance */
const FLICK = 0.3;
/** Past the actions' width the row follows at this fraction of the finger, pulled back */
const DRAG = 0.3;

/** Which way a finger is going once it has gone past the slop; null until then */
export function axisOf(dx: number, dy: number): "x" | "y" | null {
  if (Math.hypot(dx, dy) < SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/**
 * Where the row is for a finger that wants it at `wanted`: freely between closed and open,
 * resisting past open, and never past closed the other way (there is nothing on the left).
 */
export function resist(wanted: number, width: number): number {
  if (wanted >= 0) return 0;
  if (wanted >= -width) return wanted;
  return -width + (wanted + width) * DRAG;
}

/** Let go at `offset`, moving at `velocity` (px/ms): whether the row settles open */
export function settlesOpen(offset: number, width: number, velocity: number): boolean {
  if (velocity <= -FLICK) return true;
  if (velocity >= FLICK) return false;
  return offset < -width / 2;
}
