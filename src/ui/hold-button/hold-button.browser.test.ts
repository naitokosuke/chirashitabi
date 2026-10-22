import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import { HOLD_TIME, state } from "./harness";
import HoldButtonHarness from "./HoldButtonHarness.vue";

/**
 * The button in Chromium: held for its time it acts once and says so; let go early it fills
 * part way and drains back, acting not at all; Space or Enter held acts too, and Escape, a
 * cancelled pointer or the button turning disabled lets go. A screen reader's click starts it.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.held = 0;
  state.disabled = false;
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(HoldButtonHarness as VaporComponent);
  app.mount(root);
  await nextTick();
});
afterEach(() => {
  vi.useRealTimers();
  app?.unmount();
  document.body.replaceChildren();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * The fill's clock in the test's hands: its frames and `performance.now()` move only as
 * `run(ms)` passes time, so how far it has come is known, not raced
 */
const FILL_CLOCK: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
};
async function run(ms: number) {
  vi.advanceTimersByTime(ms);
  await nextTick();
}
/** The one button; by its role and name only at first, since done it says something else */
const el = () => document.querySelector<HTMLElement>("button")!;
const fill = () => parseFloat(el().style.getPropertyValue("--p"));
const pointer = (type: string, x: number, y: number) =>
  el().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y,
    }),
  );
const middle = () => {
  const r = el().getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
/** A click with `detail` clicks counted: 1 from a pointer, 0 from a screen reader */
const click = (detail: number) =>
  el().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));

describe("held", () => {
  test("for its time, it acts once and says so", async () => {
    expect(page.getByRole("button", { name: "Delete forever" }).element()).toBe(el());
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await expect.poll(() => el().classList.contains("holding")).toBe(true);
    await expect.poll(fill, { timeout: HOLD_TIME * 3 }).toBe(1);
    expect(state.held).toBe(1);
    expect(el().classList.contains("done")).toBe(true);
    expect(el().textContent).toContain("Deleted");
    expect(page.getByRole("status").element().textContent).toBe("Deleted");
    pointer("pointerup", x, y);
    await wait(HOLD_TIME);
    expect(state.held).toBe(1);
  });

  test("done, it takes no hold until a while later, then it is ready and acts again", async () => {
    vi.useFakeTimers({ toFake: [...(FILL_CLOCK?.toFake ?? []), "setTimeout", "clearTimeout"] });
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await run(HOLD_TIME + 50);
    pointer("pointerup", x, y);
    expect(state.held).toBe(1);
    expect(el().classList.contains("done")).toBe(true);
    // held again while it says it is done: nothing
    pointer("pointerdown", x, y);
    await run(HOLD_TIME / 2);
    pointer("pointerup", x, y);
    expect(state.held).toBe(1);
    // a while later it is ready again, and a hold acts once more
    await run(2000);
    expect(el().classList.contains("idle")).toBe(true);
    pointer("pointerdown", x, y);
    await run(HOLD_TIME + 50);
    pointer("pointerup", x, y);
    expect(state.held).toBe(2);
  });

  test("let go early, it has filled part way, drains back and does nothing", async () => {
    vi.useFakeTimers(FILL_CLOCK);
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await run(HOLD_TIME / 2);
    expect(fill()).toBeGreaterThan(0.4);
    expect(fill()).toBeLessThan(0.6);
    pointer("pointerup", x, y);
    await run(HOLD_TIME);
    expect(fill()).toBe(0);
    expect(state.held).toBe(0);
    expect(el().classList.contains("idle")).toBe(true);
    expect(page.getByRole("status").element().textContent).toBe("");
  });

  test("a pointer drifting off it lets go", async () => {
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await wait(HOLD_TIME / 4);
    pointer("pointermove", x + 400, y);
    await expect.poll(fill).toBe(0);
    expect(state.held).toBe(0);
  });

  test("a pointer the browser cancels lets go", async () => {
    vi.useFakeTimers(FILL_CLOCK);
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await run(HOLD_TIME / 2);
    pointer("pointercancel", x, y);
    await run(HOLD_TIME * 2);
    expect(fill()).toBe(0);
    expect(state.held).toBe(0);
  });

  test("turned disabled mid-hold, it lets go and does nothing", async () => {
    vi.useFakeTimers(FILL_CLOCK);
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await run(HOLD_TIME / 2);
    state.disabled = true;
    await nextTick();
    await run(HOLD_TIME * 2);
    expect(fill()).toBe(0);
    expect(state.held).toBe(0);
    expect(el().classList.contains("idle")).toBe(true);
  });
});

describe("from the keyboard", () => {
  test("Space held acts; Escape lets go", async () => {
    el().focus();
    await userEvent.keyboard("{Space>}");
    await wait(HOLD_TIME / 4);
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{/Space}");
    await expect.poll(fill).toBe(0);
    expect(state.held).toBe(0);

    await userEvent.keyboard("{Space>}");
    await expect.poll(fill, { timeout: HOLD_TIME * 3 }).toBe(1);
    await userEvent.keyboard("{/Space}");
    expect(state.held).toBe(1);
  });

  test("Enter held acts; let go early, it does not", async () => {
    vi.useFakeTimers(FILL_CLOCK);
    el().focus();
    await userEvent.keyboard("{Enter>}");
    await run(HOLD_TIME / 2);
    await userEvent.keyboard("{/Enter}");
    await run(HOLD_TIME * 2);
    expect(state.held).toBe(0);

    await userEvent.keyboard("{Enter>}");
    await run(HOLD_TIME * 2);
    expect(state.held).toBe(1);
    await userEvent.keyboard("{/Enter}");
    expect(state.held).toBe(1);
  });
});

describe("clicked", () => {
  test("by a pointer, with no hold, it does nothing", async () => {
    vi.useFakeTimers(FILL_CLOCK);
    click(1);
    await run(HOLD_TIME * 2);
    expect(fill()).toBe(0);
    expect(state.held).toBe(0);
  });

  test("by a screen reader, it fills and acts; clicked again before then, it lets go", async () => {
    vi.useFakeTimers(FILL_CLOCK);
    click(0);
    await run(HOLD_TIME / 2);
    expect(el().classList.contains("holding")).toBe(true);
    click(0);
    await run(HOLD_TIME * 2);
    expect(fill()).toBe(0);
    expect(state.held).toBe(0);

    click(0);
    await run(HOLD_TIME * 2);
    expect(state.held).toBe(1);
  });
});
