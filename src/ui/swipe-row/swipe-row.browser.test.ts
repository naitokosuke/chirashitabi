import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import { state } from "./harness";
import SwipeRowHarness from "./SwipeRowHarness.vue";

/**
 * The row in Chromium: a mouse slides it aside to its action and lets go; ← opens it from
 * the keyboard and hands the focus to the action; → shuts it.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.open = false;
  state.taken = 0;
  const root = document.createElement("div");
  root.style.width = "320px";
  document.body.append(root);
  app = createVaporApp(SwipeRowHarness as VaporComponent);
  app.mount(root);
  await nextTick();
});
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

const row = () => document.querySelector<HTMLElement>(".row")!;
const content = () => row().querySelector<HTMLElement>(".content")!;
const link = () => page.getByRole("link", { name: "Taiwan trip" });
const action = () => page.getByRole("button", { name: "Delete" });
const shift = () => content().getBoundingClientRect().left - row().getBoundingClientRect().left;

/**
 * A mouse pressed on the row, moved by `dx` in a few steps a beat apart (the events' clock is
 * real time: moves too close together read as a flick), and let go
 */
async function slide(dx: number) {
  const r = row().getBoundingClientRect();
  const x0 = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const at = (type: string, x: number) =>
    row().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: type === "pointerdown" ? 0 : -1,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: x,
        clientY: y,
      }),
    );
  at("pointerdown", x0);
  for (let i = 1; i <= 4; i++) {
    await new Promise((r) => setTimeout(r, 40));
    at("pointermove", x0 + (dx * i) / 4);
  }
  await new Promise((r) => setTimeout(r, 40));
  at("pointerup", x0 + dx);
}

describe("sliding", () => {
  test("a mouse slides the row aside and, past halfway, it settles open on its action", async () => {
    await slide(-80);
    await nextTick();
    expect(state.open).toBe(true);
    await expect.poll(shift).toBeLessThan(-80);
    expect(action().element().closest("[inert]")).toBeNull();
  });

  test("let go short of halfway, it settles back", async () => {
    await slide(-20);
    await nextTick();
    expect(state.open).toBe(false);
    await expect.poll(shift).toBe(0);
  });

  test("open, a click on the row shuts it rather than following the link", async () => {
    state.open = true;
    await nextTick();
    await expect.poll(shift).toBeLessThan(-80);
    await userEvent.click(link());
    await nextTick();
    expect(state.open).toBe(false);
    expect(location.hash).toBe("");
  });
});

describe("the keyboard", () => {
  test("← opens the row and puts the focus on its action; → shuts it and gives the focus back", async () => {
    (link().element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowLeft}");
    await nextTick();
    expect(state.open).toBe(true);
    await expect.poll(() => document.activeElement).toBe(action().element());
    await userEvent.keyboard("{ArrowRight}");
    await nextTick();
    expect(state.open).toBe(false);
    expect(document.activeElement).toBe(link().element());
  });

  test("the action, reached, acts", async () => {
    (link().element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(() => document.activeElement).toBe(action().element());
    await userEvent.keyboard("{Enter}");
    expect(state.taken).toBe(1);
  });
});
