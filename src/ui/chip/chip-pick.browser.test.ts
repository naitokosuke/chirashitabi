import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import ChipPickHarness from "./ChipPickHarness.vue";
import { state } from "./harness";

/**
 * The chips in Chromium: the ink fills the chosen chip, and picking another it stretches
 * across to it, leading edge first, then contracts onto it at its own width. Where it is on the
 * way is read at a set moment of its slides, held there, not after however many frames the
 * machine managed.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.picked = "TWD";
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(ChipPickHarness as VaporComponent);
  app.mount(root);
  await nextTick();
  // placed and painted: from now on it slides
  await expect.poll(() => pill().classList.contains("ready")).toBe(true);
});
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

const chip = (name: string) => page.getByRole("radio", { name });
const root = () => document.querySelector<HTMLElement>(".pick")!;
const pill = () => root().querySelector<HTMLElement>(".pill")!;
/** `el`'s edges, from the row's corner */
const edgesOf = (el: Element) => {
  const a = root().getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return { left: b.left - a.left, right: b.right - a.left };
};
/**
 * Early in the slides (ms): the leading edge well on its way, the trailing one still waiting
 * its beat (a quarter of `--duration-morph`, 87.5ms)
 */
const EARLY = 60;
/** The ink's slides once a pick has set them off (its left edge's and its right edge's) */
async function slides() {
  await expect.poll(() => pill().getAnimations().length).toBeGreaterThan(0);
  return pill().getAnimations();
}
/** The ink's edges `ms` into `sliding`, which are held there */
function edgesAt(sliding: Animation[], ms: number) {
  for (const a of sliding) {
    a.pause();
    a.currentTime = ms;
  }
  return edgesOf(pill());
}

describe("the ink", () => {
  test("fills the chosen chip from the start", async () => {
    expect(pill().classList.contains("shown")).toBe(true);
    const c = () => edgesOf(chip("TWD").element());
    await expect.poll(() => edgesOf(pill()).left).toBeCloseTo(c().left, 0);
    await expect.poll(() => edgesOf(pill()).right).toBeCloseTo(c().right, 0);
    expect(chip("TWD").element().getAttribute("aria-checked")).toBe("true");
  });

  test("stretches across to the chip picked, leading edge first, and contracts onto it", async () => {
    const from = edgesOf(chip("TWD").element());
    await expect.poll(() => edgesOf(pill()).left).toBeCloseTo(from.left, 0);
    await userEvent.click(chip("EUR"));
    expect(state.picked).toBe("EUR");
    const to = edgesOf(chip("EUR").element());
    const sliding = await slides();
    const mid = edgesAt(sliding, EARLY);
    expect(mid.right - from.right).toBeGreaterThan(mid.left - from.left);
    expect(mid.right - mid.left).toBeGreaterThan(from.right - from.left);
    for (const a of sliding) a.finish();
    expect(edgesOf(pill()).left).toBeCloseTo(to.left, 0);
    expect(edgesOf(pill()).right).toBeCloseTo(to.right, 0);
    expect(chip("EUR").element().getAttribute("aria-checked")).toBe("true");
  });

  test("the chips are open, so the ink shows through on the way", () => {
    expect(getComputedStyle(chip("JPY").element()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });
});
