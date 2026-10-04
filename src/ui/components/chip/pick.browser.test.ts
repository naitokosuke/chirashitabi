import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../../styles/index.css";

import ChipPickHarness from "./ChipPickHarness.vue";
import { state } from "./harness";

/**
 * The chips in Chromium: the ink fills the chosen chip, and picking another it stretches
 * across to it, leading edge first, then contracts onto it at its own width.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.picked = "TWD";
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(ChipPickHarness as VaporComponent);
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
const chip = (name: string) => page.getByRole("radio", { name });
const root = () => document.querySelector<HTMLElement>(".pick")!;
const pill = () => root().querySelector<HTMLElement>(".pill")!;
/** `el`'s edges, from the row's corner */
const edgesOf = (el: Element) => {
  const a = root().getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return { left: b.left - a.left, right: b.right - a.left };
};

describe("the ink", () => {
  test("fills the chosen chip from the start", async () => {
    expect(pill().hasAttribute("data-shown")).toBe(true);
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
    await frames(2);
    const mid = edgesOf(pill());
    expect(mid.right - from.right).toBeGreaterThan(mid.left - from.left);
    expect(mid.right - mid.left).toBeGreaterThan(from.right - from.left);
    await expect.poll(() => edgesOf(pill()).left).toBeCloseTo(to.left, 0);
    await expect.poll(() => edgesOf(pill()).right).toBeCloseTo(to.right, 0);
    expect(chip("EUR").element().getAttribute("aria-checked")).toBe("true");
  });

  test("the chips are open, so the ink shows through on the way", () => {
    expect(getComputedStyle(chip("JPY").element()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });
});
