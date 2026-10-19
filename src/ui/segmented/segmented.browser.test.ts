import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import { state } from "./harness";
import SegmentedHarness from "./SegmentedHarness.vue";

/**
 * The switch in Chromium: the pill sits under the chosen option, and picking another it
 * stretches across the two, its leading edge first, then contracts onto the new one.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.picked = "edit";
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(SegmentedHarness as VaporComponent);
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
const option = (name: string) => page.getByRole("radio", { name });
const root = () => document.querySelector<HTMLElement>("[role=radiogroup]")!;
const pill = () => root().querySelector<HTMLElement>(".pill")!;
/** `el`'s edges, from the track's corner */
const edgesOf = (el: Element) => {
  const a = root().getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return { left: b.left - a.left, right: b.right - a.left };
};

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
    await frames(2);
    // on the way: the right edge has gone further than the left one, so the pill is wider
    const mid = edgesOf(pill());
    expect(mid.right - from.right).toBeGreaterThan(mid.left - from.left);
    expect(mid.right - mid.left).toBeGreaterThan(from.right - from.left);
    // landed, at the pick's own width
    await expect.poll(() => edgesOf(pill()).left).toBeCloseTo(to.left, 0);
    await expect.poll(() => edgesOf(pill()).right).toBeCloseTo(to.right, 0);
    expect(option("Read").element().getAttribute("aria-checked")).toBe("true");
  });

  test("going back, the left edge leads", async () => {
    state.picked = "read";
    const from = () => edgesOf(option("Read").element());
    await expect.poll(() => edgesOf(pill()).left).toBeCloseTo(from().left, 0);
    await expect.poll(() => edgesOf(pill()).right).toBeCloseTo(from().right, 0);
    await userEvent.click(option("Edit"));
    const to = edgesOf(option("Edit").element());
    await frames(2);
    const mid = edgesOf(pill());
    expect(from().left - mid.left).toBeGreaterThan(from().right - mid.right);
    await expect.poll(() => edgesOf(pill()).left).toBeCloseTo(to.left, 0);
    await expect.poll(() => edgesOf(pill()).right).toBeCloseTo(to.right, 0);
  });
});
