import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../../styles/index.css";

import ChipPickHarness from "./ChipPickHarness.vue";
import { state } from "./harness";

/**
 * The chips in Chromium: the target's corners frame the chosen chip, and fly to the next one
 * picked (a different width) to lock on there.
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
const PAD = 3;

describe("the target", () => {
  test("frames the chosen chip from the start, its corners 3px out", async () => {
    expect(target().hasAttribute("data-shown")).toBe(true);
    const c = () => boxOf(chip("TWD").element());
    await expect.poll(() => boxOf(corner("tr")).right).toBeCloseTo(c().right + PAD, 0);
    await expect.poll(() => boxOf(corner("tl")).left).toBeCloseTo(c().left - PAD, 0);
    await expect.poll(() => boxOf(corner("bl")).bottom).toBeCloseTo(c().bottom + PAD, 0);
    expect(chip("TWD").element().getAttribute("aria-checked")).toBe("true");
  });

  test("flies to the chip picked and locks on, at its width", async () => {
    const from = boxOf(chip("TWD").element());
    await expect.poll(() => boxOf(corner("tr")).right).toBeCloseTo(from.right + PAD, 0);
    await userEvent.click(chip("EUR"));
    expect(state.picked).toBe("EUR");
    const to = boxOf(chip("EUR").element());
    await frames(2);
    expect(boxOf(corner("tl")).left).toBeGreaterThan(from.left - PAD);
    expect(boxOf(corner("tl")).left).toBeLessThan(to.left - PAD);
    await expect.poll(() => boxOf(corner("tl")).left).toBeCloseTo(to.left - PAD, 0);
    await expect.poll(() => boxOf(corner("tr")).right).toBeCloseTo(to.right + PAD, 0);
    expect(chip("EUR").element().getAttribute("aria-checked")).toBe("true");
  });
});
