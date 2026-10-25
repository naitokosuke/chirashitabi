import type { NoteId } from "../notes/id";
import type { Note } from "../notes/types";
import type { Shape } from "../notes/useNotes";

import { distance, type PinchStart, type Pt } from "./transform";

/** A card held by a finger; (ox, oy) is where on the card it was grabbed */
export interface Grab {
  note: Note;
  ox: number;
  oy: number;
}
/** A card's middle on screen, which it turns and grows around */
export interface Pivot {
  note: Note;
  cx: number;
  cy: number;
}
/**
 * What the fingers (or the mouse) are doing right now: one thing at a time. A card under a
 * finger carries where it is drawn now (`to`, `shape`), null until the finger first moves it.
 */
export type Gesture =
  | { kind: "idle" }
  /** Down on a card, not moved yet: becomes a drag, a tap (pick; twice, edit) or a long press (menu) */
  | { kind: "press"; grab: Grab; sx: number; sy: number; timer: ReturnType<typeof setTimeout> }
  | { kind: "drag"; grab: Grab; to: Pt | null; lastSend: number }
  /** A picked card's corner handle: its size follows the finger's distance from the middle */
  | {
      kind: "resize";
      at: Pivot;
      d0: number;
      scale0: number;
      shape: Shape | null;
      lastSend: number;
    }
  /** A picked card's top handle: it turns with the finger around the middle */
  | { kind: "rotate"; at: Pivot; a0: number; rot0: number; shape: Shape | null; lastSend: number }
  /** Down on the desk: becomes a pan, or a tap that lets go of the picked card */
  | { kind: "pan"; x: number; y: number; tx: number; ty: number; moved: boolean }
  | { kind: "pinch"; start: PinchStart };
export const IDLE: Gesture = { kind: "idle" };

/**
 * A card under a finger, as it is drawn: moved, or turned and sized where it is. It is drawn
 * from here, not from the cache: intermediate states do not belong in the room's data
 * (docs/data-fetching.md). Letting go writes it once.
 */
export type Held = { id: NoteId; x: number; y: number } & (
  | { kind: "move" }
  | { kind: "shape"; shape: Shape }
);

/** The card the gesture holds, where it is drawn now; none before a finger first moves it */
export function heldOf(g: Gesture): Held | null {
  switch (g.kind) {
    case "drag":
      return g.to === null ? null : { kind: "move", id: g.grab.note.id, ...g.to };
    case "resize":
    case "rotate": {
      const { note } = g.at;
      return g.shape === null
        ? null
        : { kind: "shape", id: note.id, x: note.x, y: note.y, shape: g.shape };
    }
    default:
      return null;
  }
}

/** Sizes a card may be drawn at; the room takes 0.5 to 3 (src/worker/wire.ts) */
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
/** Holding Shift while turning snaps to this many degrees */
const SNAP_DEG = 15;

export const angleOf = (at: Pivot, p: Pt) => (Math.atan2(p.y - at.cy, p.x - at.cx) * 180) / Math.PI;
/** Degrees in (-180, 180], so a card turned all the way round is stored as it looks */
export const wrap = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** The size a corner handle at `p` gives the card, kept as it is turned */
export function resized(g: Extract<Gesture, { kind: "resize" }>, p: Pt): Shape {
  const d = distance(p, { x: g.at.cx, y: g.at.cy });
  return {
    rot: g.at.note.rot,
    scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, (g.scale0 * d) / g.d0)),
  };
}
/** The turn a top handle at `p` gives the card, by whole steps when `snap`, kept as large as it is */
export function turned(g: Extract<Gesture, { kind: "rotate" }>, p: Pt, snap: boolean): Shape {
  const deg = g.rot0 + angleOf(g.at, p) - g.a0;
  return {
    rot: wrap(snap ? Math.round(deg / SNAP_DEG) * SNAP_DEG : deg),
    scale: g.at.note.scale,
  };
}
