import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../../styles/index.css";

import CalendarHarness from "./CalendarHarness.vue";
import { START, state } from "./harness";

/**
 * The calendar in Chromium: tapping a first day and then a last one picks the range, the
 * days between banded, and the band follows the pointer while the last is still to come.
 */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.range = true;
  state.day = START;
  state.dates = { start: START, end: START.add({ days: 3 }) };
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(CalendarHarness as VaporComponent);
  app.mount(root);
  await nextTick();
});
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

const day = (iso: string) =>
  page.getByRole("button", {
    name: new RegExp(`^\\w+, \\w+ ${Number(iso.slice(8))}, ${iso.slice(0, 4)}$`),
  });
const cell = (iso: string) => document.querySelector(`[data-date="${iso}"]`)!.parentElement!;
const banded = () =>
  [...document.querySelectorAll("td[data-within]")].map(
    (td) => td.querySelector("button")!.dataset.date,
  );

describe("with range", () => {
  test("opens on the range's month, its ends inked and the days between banded", () => {
    expect(document.querySelector("h3")!.textContent).toBe("November 2026");
    expect(cell("2026-11-03").hasAttribute("data-start")).toBe(true);
    expect(cell("2026-11-06").hasAttribute("data-end")).toBe(true);
    expect(banded()).toEqual(["2026-11-04", "2026-11-05"]);
  });

  test("a first day, then a last one", async () => {
    await userEvent.click(day("2026-11-10"));
    expect(state.dates.start.toString()).toBe("2026-11-10");
    expect(state.dates.end).toBeNull();
    expect(banded()).toEqual([]);

    // the band follows the pointer from the first day
    await userEvent.hover(day("2026-11-13"));
    await expect.poll(banded).toEqual(["2026-11-11", "2026-11-12"]);

    await userEvent.click(day("2026-11-13"));
    expect(state.dates.end?.toString()).toBe("2026-11-13");
  });

  test("the last day can be in the next month", async () => {
    await userEvent.click(day("2026-11-28"));
    await userEvent.click(page.getByRole("button", { name: "Next month" }));
    expect(document.querySelector("h3")!.textContent).toBe("December 2026");
    await userEvent.click(day("2026-12-02"));
    expect(state.dates.start.toString()).toBe("2026-11-28");
    expect(state.dates.end?.toString()).toBe("2026-12-02");
  });

  test("the arrow keys walk the days, across into the next month", async () => {
    document.querySelector<HTMLElement>('[data-date="2026-11-03"]')!.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement?.getAttribute("data-date")).toBe("2026-12-01");
    expect(document.querySelector("h3")!.textContent).toBe("December 2026");
  });
});

describe("without range", () => {
  test("a tap picks the one day", async () => {
    state.range = false;
    await nextTick();
    expect(cell("2026-11-03").hasAttribute("data-start")).toBe(true);
    await userEvent.click(day("2026-11-12"));
    expect(state.day.toString()).toBe("2026-11-12");
    expect(cell("2026-11-12").hasAttribute("data-start")).toBe(true);
    expect(cell("2026-11-03").hasAttribute("data-start")).toBe(false);
    expect(banded()).toEqual([]);
  });
});
