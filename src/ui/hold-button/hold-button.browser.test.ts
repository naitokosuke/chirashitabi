import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import { HOLD_TIME, state } from "./harness";
import HoldButtonHarness from "./HoldButtonHarness.vue";

/**
 * The button in Chromium: held for its time it acts once and says so; let go early it fills
 * part way and drains back, acting not at all; Space held acts too, and Escape lets go.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.held = 0;
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(HoldButtonHarness as VaporComponent);
  app.mount(root);
  await nextTick();
});
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

describe("held", () => {
  test("for its time, it acts once and says so", async () => {
    expect(page.getByRole("button", { name: "Delete forever" }).element()).toBe(el());
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await expect.poll(() => el().dataset.state).toBe("holding");
    await expect.poll(fill, { timeout: HOLD_TIME * 3 }).toBe(1);
    expect(state.held).toBe(1);
    expect(el().dataset.state).toBe("done");
    expect(el().textContent).toContain("Deleted");
    pointer("pointerup", x, y);
    await wait(HOLD_TIME);
    expect(state.held).toBe(1);
  });

  test("let go early, it has filled part way, drains back and does nothing", async () => {
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await wait(HOLD_TIME / 2);
    const partWay = fill();
    expect(partWay).toBeGreaterThan(0.2);
    expect(partWay).toBeLessThan(0.9);
    pointer("pointerup", x, y);
    await expect.poll(fill).toBe(0);
    expect(state.held).toBe(0);
    expect(el().dataset.state).toBe("idle");
  });

  test("a pointer drifting off it lets go", async () => {
    const { x, y } = middle();
    pointer("pointerdown", x, y);
    await wait(HOLD_TIME / 4);
    pointer("pointermove", x + 400, y);
    await expect.poll(fill).toBe(0);
    expect(state.held).toBe(0);
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
});
