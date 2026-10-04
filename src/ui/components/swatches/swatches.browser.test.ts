import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../../styles/index.css";

import { COLORS, state } from "./harness";
import SwatchesHarness from "./SwatchesHarness.vue";

/**
 * The swatches in Chromium: the ring of ink sits behind the chosen color, flows to the next
 * one picked, and the drop that bridges the way is out only while it travels.
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
const swatch = (i: number) => page.getByRole("button", { name: `color ${i + 1}` });
const root = () => document.querySelector<HTMLElement>(".swatches")!;
const goo = () => root().querySelector<HTMLElement>(".goo")!;
const ring = () => goo().querySelector<HTMLElement>(".ring")!;
const drop = () => goo().querySelector<HTMLElement>(".drop")!;
/** Where the ring is told to be, from the row's corner */
const told = () => ({
  x: parseFloat(goo().style.getPropertyValue("--x")),
  y: parseFloat(goo().style.getPropertyValue("--y")),
});
/** Where the ring is drawn: its middle, from the row's corner */
const drawn = (el: HTMLElement) => {
  const a = root().getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 };
};
/** The middle of swatch `i`, from the row's corner */
const under = (i: number) => drawn(swatch(i).element() as HTMLElement);

describe("the ring", () => {
  test("sits behind the chosen color from the start", async () => {
    expect(goo().hasAttribute("data-shown")).toBe(true);
    // the styles arrive after the first paint here; the row's resize places the ring again
    await expect.poll(() => told().x).toBeCloseTo(under(0).x, 0);
    await expect.poll(() => drawn(ring()).x).toBeCloseTo(under(0).x, 0);
    expect(swatch(0).element().getAttribute("aria-pressed")).toBe("true");
  });

  test("flows to the color picked, and the drop comes out on the way and pulls back after", async () => {
    await userEvent.click(swatch(3));
    expect(state.selected).toBe(COLORS[3]);
    await nextTick();
    expect(told().x).toBeCloseTo(under(3).x, 0);
    // on the way: the ring is between the two, and the drop is out
    await frames(3);
    expect(drawn(ring()).x).toBeGreaterThan(under(0).x);
    expect(drawn(ring()).x).toBeLessThan(under(3).x);
    expect(drop().hasAttribute("data-out")).toBe(true);
    // arrived: the ring under the pick, the drop back in
    await expect.poll(() => drawn(ring()).x).toBeCloseTo(under(3).x, 0);
    await expect.poll(() => drop().hasAttribute("data-out")).toBe(false);
    expect(swatch(3).element().getAttribute("aria-pressed")).toBe("true");
    expect(swatch(0).element().getAttribute("aria-pressed")).toBe("false");
  });

  test("the swatches stay sharp: only the ink is behind the filter", () => {
    expect(goo().style.filter).toMatch(/^url\("?#.+-goo"?\)$/);
    expect(getComputedStyle(swatch(0).element()).filter).toBe("none");
  });
});
