import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { MemberId } from "../members/types";
import type { NoteId } from "../notes/id";
import type { TextBox } from "../notes/types";

import { heldOf, IDLE, resized, turned, wrap, type Gesture, type Pivot } from "./gesture";

const box: TextBox = {
  id: "t" as NoteId,
  kind: "text",
  text: "Day 1",
  x: 10,
  y: 20,
  rot: 5,
  scale: 1,
  by: "yuki" as MemberId,
  updatedAt: Temporal.Instant.from("2026-10-01T00:00:00Z"),
};
/** The box's middle on screen, at (100, 100) */
const at: Pivot = { note: box, cx: 100, cy: 100 };

describe("heldOf", () => {
  test("a card is held once a finger has moved it, not before", () => {
    const drag: Gesture = {
      kind: "drag",
      grab: { note: box, ox: 4, oy: 6 },
      to: null,
      lastSend: 0,
    };
    expect(heldOf(drag)).toBeNull();
    expect(heldOf({ ...drag, to: { x: 50, y: 60 } })).toEqual({
      kind: "move",
      id: box.id,
      x: 50,
      y: 60,
    });
  });

  test("a card turned or sized is held where it is", () => {
    const shape = { rot: 30, scale: 1.5 };
    const rotate: Gesture = { kind: "rotate", at, a0: 0, rot0: 5, shape: null, lastSend: 0 };
    expect(heldOf(rotate)).toBeNull();
    expect(heldOf({ ...rotate, shape })).toEqual({
      kind: "shape",
      id: box.id,
      x: 10,
      y: 20,
      shape,
    });
  });

  test("the desk's gestures hold no card", () => {
    expect(heldOf(IDLE)).toBeNull();
    expect(heldOf({ kind: "pan", x: 0, y: 0, tx: 0, ty: 0, moved: true })).toBeNull();
  });
});

describe("resized", () => {
  const g: Extract<Gesture, { kind: "resize" }> = {
    kind: "resize",
    at,
    d0: 50,
    scale0: 1,
    shape: null,
    lastSend: 0,
  };

  test("the size follows the finger's distance from the middle; the turn stays", () => {
    expect(resized(g, { x: 175, y: 100 })).toEqual({ rot: 5, scale: 1.5 });
  });

  test("it stays between the sizes a card may be drawn at", () => {
    expect(resized(g, { x: 101, y: 100 }).scale).toBe(0.6);
    expect(resized(g, { x: 900, y: 100 }).scale).toBe(2.5);
  });
});

describe("turned", () => {
  // grabbed straight right of the middle, the card turned 5°
  const g: Extract<Gesture, { kind: "rotate" }> = {
    kind: "rotate",
    at,
    a0: 0,
    rot0: 5,
    shape: null,
    lastSend: 0,
  };

  test("the card turns with the finger around the middle; its size stays", () => {
    expect(turned(g, { x: 100, y: 150 }, false)).toEqual({ rot: 95, scale: 1 });
  });

  test("Shift snaps to whole steps", () => {
    expect(turned(g, { x: 100, y: 150 }, true).rot).toBe(90);
  });
});

describe("wrap", () => {
  test("degrees come back within (-180, 180]", () => {
    expect(wrap(190)).toBe(-170);
    expect(wrap(-180)).toBe(180);
    expect(wrap(540)).toBe(180);
    expect(wrap(-30)).toBe(-30);
  });
});
