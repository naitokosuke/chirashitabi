import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../../styles/index.css";

import { COLORS, state } from "./harness";
import SwatchesHarness from "./SwatchesHarness.vue";

/**
 * The swatches in Chromium: the target's corners frame the chosen color, and fly to the next
 * one picked, each on its own, to lock on there.
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
const target = () => root().querySelector<HTMLElement>(".target")!;
const corner = (c: "tl" | "tr" | "br" | "bl") => target().querySelector<HTMLElement>(`.${c}`)!;
/** `el`'s box, from the row's corner */
const boxOf = (el: Element) => {
  const a = root().getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return {
    left: b.left - a.left,
    top: b.top - a.top,
    right: b.right - a.left,
    bottom: b.bottom - a.top,
  };
};
const PAD = 4;

describe("the target", () => {
  test("frames the chosen color from the start, its corners 4px out", async () => {
    expect(target().hasAttribute("data-shown")).toBe(true);
    // the styles arrive after the first paint here; the row's resize places the corners again
    const s = () => boxOf(swatch(0).element());
    await expect.poll(() => boxOf(corner("tl")).left).toBeCloseTo(s().left - PAD, 0);
    await expect.poll(() => boxOf(corner("tl")).top).toBeCloseTo(s().top - PAD, 0);
    await expect.poll(() => boxOf(corner("tr")).right).toBeCloseTo(s().right + PAD, 0);
    await expect.poll(() => boxOf(corner("br")).bottom).toBeCloseTo(s().bottom + PAD, 0);
    await expect.poll(() => boxOf(corner("bl")).left).toBeCloseTo(s().left - PAD, 0);
    expect(swatch(0).element().getAttribute("aria-checked")).toBe("true");
  });

  test("flies to the color picked, corner by corner, and locks on", async () => {
    const from = boxOf(swatch(0).element());
    await expect.poll(() => boxOf(corner("tl")).left).toBeCloseTo(from.left - PAD, 0);
    await userEvent.click(swatch(3));
    expect(state.selected).toBe(COLORS[3]);
    const to = boxOf(swatch(3).element());
    await frames(2);
    // on the way: between the two
    expect(boxOf(corner("tl")).left).toBeGreaterThan(from.left - PAD);
    expect(boxOf(corner("tl")).left).toBeLessThan(to.left - PAD);
    // locked on
    await expect.poll(() => boxOf(corner("tl")).left).toBeCloseTo(to.left - PAD, 0);
    await expect.poll(() => boxOf(corner("br")).right).toBeCloseTo(to.right + PAD, 0);
    expect(swatch(3).element().getAttribute("aria-checked")).toBe("true");
    expect(swatch(0).element().getAttribute("aria-checked")).toBe("false");
  });
});
