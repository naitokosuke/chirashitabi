import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import { state } from "./harness";
import SegmentedHarness from "./SegmentedHarness.vue";

/**
 * The switch in Chromium: the pill sits under the chosen option, and picking another it
 * stretches across the two, its leading edge first, then contracts onto the new one.
 *
 * Where it is on the way is read at a set moment of its slides, held there, not after however
 * many frames the machine managed: later on the trailing edge catches up, and going back (the
 * left edge has less far to go than the right one) it is past the leading one by 200ms.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.picked = "edit";
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(SegmentedHarness as VaporComponent);
  app.mount(root);
  await nextTick();
  // placed and painted: from now on it slides
  await expect.poll(() => pill().classList.contains("ready")).toBe(true);
});
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

const option = (name: string) => page.getByRole("radio", { name });
const root = () => document.querySelector<HTMLElement>("[role=radiogroup]")!;
const pill = () => root().querySelector<HTMLElement>(".pill")!;
/** `el`'s edges, from the track's corner */
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
/** The pill's slides once a pick has set them off (its left edge's and its right edge's) */
async function slides() {
  await expect.poll(() => pill().getAnimations().length).toBeGreaterThan(0);
  return pill().getAnimations();
}
/** The pill's edges `ms` into `sliding`, which are held there */
function edgesAt(sliding: Animation[], ms: number) {
  for (const a of sliding) {
    a.pause();
    a.currentTime = ms;
  }
  return edgesOf(pill());
}

describe("the pill", () => {
  test("sits under the chosen option from the start", async () => {
    const o = () => edgesOf(option("Edit").element());
    await expect.poll(() => edgesOf(pill()).left).toBeCloseTo(o().left, 0);
    await expect.poll(() => edgesOf(pill()).right).toBeCloseTo(o().right, 0);
    expect(option("Edit").element().getAttribute("aria-checked")).toBe("true");
  });

  test("going forward, stretches toward the pick, leading edge first, then contracts onto it", async () => {
    const from = edgesOf(option("Edit").element());
    await expect.poll(() => edgesOf(pill()).left).toBeCloseTo(from.left, 0);
    await userEvent.click(option("Read"));
    expect(state.picked).toBe("read");
    const to = edgesOf(option("Read").element());
    const sliding = await slides();
    // on the way: the right edge has gone further than the left one, so the pill is wider
    const mid = edgesAt(sliding, EARLY);
    expect(mid.right - from.right).toBeGreaterThan(mid.left - from.left);
    expect(mid.right - mid.left).toBeGreaterThan(from.right - from.left);
    // landed, at the pick's own width
    for (const a of sliding) a.finish();
    expect(edgesOf(pill()).left).toBeCloseTo(to.left, 0);
    expect(edgesOf(pill()).right).toBeCloseTo(to.right, 0);
    expect(option("Read").element().getAttribute("aria-checked")).toBe("true");
  });

  test("going back, the left edge leads", async () => {
    state.picked = "read";
    for (const a of await slides()) a.finish();
    const from = edgesOf(option("Read").element());
    expect(edgesOf(pill()).left).toBeCloseTo(from.left, 0);
    expect(edgesOf(pill()).right).toBeCloseTo(from.right, 0);
    await userEvent.click(option("Edit"));
    const to = edgesOf(option("Edit").element());
    const sliding = await slides();
    const mid = edgesAt(sliding, EARLY);
    expect(from.left - mid.left).toBeGreaterThan(from.right - mid.right);
    for (const a of sliding) a.finish();
    expect(edgesOf(pill()).left).toBeCloseTo(to.left, 0);
    expect(edgesOf(pill()).right).toBeCloseTo(to.right, 0);
  });
});
