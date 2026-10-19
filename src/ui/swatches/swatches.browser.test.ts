import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import { COLORS, state } from "./harness";
import SwatchesHarness from "./SwatchesHarness.vue";

/**
 * The swatches in Chromium: the ring sits around the chosen color, and picking another it
 * stretches across to it, leading edge first, then contracts around it.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.selected = COLORS[0];
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(SwatchesHarness as VaporComponent);
  app.mount(root);
  await nextTick();
  await frames(2);
});
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

const frames = (n: number) =>
  new Promise<void>((done) => {
    const step = (left: number) =>
      left === 0 ? done() : requestAnimationFrame(() => step(left - 1));
    step(n);
  });
const swatch = (i: number) => page.getByRole("radio", { name: `color ${i + 1}` });
const root = () => document.querySelector<HTMLElement>(".swatches")!;
const ring = () => root().querySelector<HTMLElement>(".pill")!;
/** `el`'s edges, from the row's corner */
const edgesOf = (el: Element) => {
  const a = root().getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return { left: b.left - a.left, right: b.right - a.left, top: b.top - a.top };
};
const PAD = 4;

describe("the ring", () => {
  test("sits around the chosen color from the start, 4px out, hollow", async () => {
    expect(ring().hasAttribute("data-shown")).toBe(true);
    const s = () => edgesOf(swatch(0).element());
    // the styles arrive after the first paint here; the row's resize places the ring again
    await expect.poll(() => edgesOf(ring()).left).toBeCloseTo(s().left - PAD, 0);
    await expect.poll(() => edgesOf(ring()).right).toBeCloseTo(s().right + PAD, 0);
    await expect.poll(() => edgesOf(ring()).top).toBeCloseTo(s().top - PAD, 0);
    expect(getComputedStyle(ring()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(swatch(0).element().getAttribute("aria-checked")).toBe("true");
  });

  test("stretches across to the color picked, leading edge first, then contracts around it", async () => {
    const from = edgesOf(swatch(0).element());
    await expect.poll(() => edgesOf(ring()).left).toBeCloseTo(from.left - PAD, 0);
    await userEvent.click(swatch(3));
    expect(state.selected).toBe(COLORS[3]);
    const to = edgesOf(swatch(3).element());
    await frames(2);
    // on the way: the right edge ahead of the left, the ring wider than it is around one
    const mid = edgesOf(ring());
    expect(mid.right - from.right).toBeGreaterThan(mid.left - from.left);
    expect(mid.right - mid.left).toBeGreaterThan(from.right - from.left + PAD * 2);
    // around the pick
    await expect.poll(() => edgesOf(ring()).left).toBeCloseTo(to.left - PAD, 0);
    await expect.poll(() => edgesOf(ring()).right).toBeCloseTo(to.right + PAD, 0);
    expect(swatch(3).element().getAttribute("aria-checked")).toBe("true");
    expect(swatch(0).element().getAttribute("aria-checked")).toBe("false");
  });
});
