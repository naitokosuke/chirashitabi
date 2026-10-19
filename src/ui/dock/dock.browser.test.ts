import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import DockHarness from "./DockHarness.vue";
import { state } from "./harness";

/**
 * The dock under a real pointer (Chromium): the icons grow toward it and follow it, the dot
 * marks what is open and only that, and moves only when that changes.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.current = "canvas";
  state.open = true;
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(DockHarness as VaporComponent);
  app.mount(root);
  await nextTick();
  await frames(2);
});
afterEach(async () => {
  await userEvent.unhover(item("theme"));
  app?.unmount();
  document.body.replaceChildren();
});

const frames = (n: number) =>
  new Promise<void>((done) => {
    const step = (left: number) =>
      left === 0 ? done() : requestAnimationFrame(() => step(left - 1));
    step(n);
  });
const item = (label: string) =>
  page.getByRole(label === "trips" ? "link" : "button", { name: label });
const rect = (label: string) => item(label).element().getBoundingClientRect();
const width = (label: string) => rect(label).width;
const middle = (r: DOMRect) => r.left + r.width / 2;
const dock = () => document.querySelector<HTMLElement>("[data-dock]")!;
const dot = () => dock().querySelector<HTMLElement>(".dot")!;
const dotX = () => parseFloat(dot().style.getPropertyValue("--x"));
/** Where the dot should be for `label`: under the item's middle, from the dock's middle, at rest */
const under = (label: string) => middle(rect(label)) - middle(dock().getBoundingClientRect());
const cell = () => parseFloat(getComputedStyle(dock()).getPropertyValue("--cell"));

describe("magnifying", () => {
  test("the icon under the pointer grows the most, its neighbours less", async () => {
    await userEvent.hover(item("map"));
    await expect.poll(() => width("map")).toBeGreaterThan(cell() * 1.4);
    expect(width("canvas")).toBeGreaterThan(cell());
    expect(width("canvas")).toBeLessThan(width("map"));
    expect(width("home")).toBeLessThan(width("canvas"));
  });

  test("the growth follows the pointer across the icons", async () => {
    await userEvent.hover(item("map"));
    await expect.poll(() => width("map")).toBeGreaterThan(cell() * 1.4);
    await userEvent.hover(item("home"));
    await expect.poll(() => width("home")).toBeGreaterThan(cell() * 1.4);
    expect(width("map")).toBeLessThan(width("canvas"));
    expect(width("canvas")).toBeLessThan(width("home"));
  });

  test("the icons spring back once the pointer leaves", async () => {
    await userEvent.hover(item("map"));
    await expect.poll(() => width("map")).toBeGreaterThan(cell() * 1.4);
    await userEvent.unhover(item("map"));
    await expect.poll(() => width("map")).toBe(cell());
    expect(dock().hasAttribute("data-magnify")).toBe(false);
  });

  test("coming back while the icons are still springing back, the growth is still under the pointer", async () => {
    await userEvent.hover(item("map"));
    await expect.poll(() => width("map")).toBeGreaterThan(cell() * 1.4);
    await userEvent.unhover(item("map"));
    await frames(2);
    await userEvent.hover(item("home"));
    await expect.poll(() => width("home")).toBeGreaterThan(cell() * 1.4);
    expect(width("map")).toBeLessThan(width("canvas"));
  });
});

describe("the dot", () => {
  test("sits under the item that is open", () => {
    expect(dot().hasAttribute("data-shown")).toBe(true);
    expect(dotX()).toBeCloseTo(under("canvas"), 0);
  });

  test("moves to the item that opens, and only then", async () => {
    const before = dotX();
    state.current = "map";
    await expect.poll(dotX).toBeCloseTo(under("map"), 0);
    expect(dotX()).not.toBeCloseTo(before, 0);
    state.current = "trips";
    await expect.poll(dotX).toBeCloseTo(under("trips"), 0);
  });

  test("has nothing to do with the pointer: it stays put while the icons grow and shrink", async () => {
    const before = dotX();
    await userEvent.hover(item("map"));
    await expect.poll(() => width("map")).toBeGreaterThan(cell() * 1.4);
    expect(dotX()).toBeCloseTo(before, 0);
    await userEvent.hover(item("canvas"));
    await expect.poll(() => width("canvas")).toBeGreaterThan(cell() * 1.4);
    expect(dotX()).toBeCloseTo(before, 0);
    await userEvent.unhover(item("canvas"));
    await expect.poll(() => width("canvas")).toBe(cell());
    expect(dotX()).toBeCloseTo(before, 0);
  });

  test("goes with a tab folded away, and comes back under the trips", async () => {
    state.open = false;
    await expect.poll(() => dot().hasAttribute("data-shown")).toBe(false);
    state.current = "trips";
    await expect.poll(() => dot().hasAttribute("data-shown")).toBe(true);
    await expect.poll(dotX).toBeCloseTo(under("trips"), 0);
  });
});
