import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import CalendarHarness from "./CalendarHarness.vue";
import { START, state } from "./harness";

/**
 * The calendar in Chromium: tapping a first day and then a last one picks the range, the
 * days between banded, and the band follows the pointer while the last is still to come. A
 * range or day set from outside turns the page to it; today is read again on coming back.
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
  vi.useRealTimers();
  app?.unmount();
  document.body.replaceChildren();
});

const day = (iso: string) =>
  page.getByRole("button", {
    name: new RegExp(`^\\w+, \\w+ ${Number(iso.slice(8))}, ${iso.slice(0, 4)}$`),
  });
const cell = (iso: string) => document.querySelector(`[data-date="${iso}"]`)!.parentElement!;
const banded = () =>
  [...document.querySelectorAll("td.within")].map((td) => td.querySelector("button")!.dataset.date);

describe("with range", () => {
  test("opens on the range's month, its ends inked and the days between banded", () => {
    expect(document.querySelector("h3")!.textContent).toBe("November 2026");
    expect(cell("2026-11-03").classList.contains("start")).toBe(true);
    expect(cell("2026-11-06").classList.contains("end")).toBe(true);
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

  test("the picked days are the grid's selected cells", () => {
    const selected = [...document.querySelectorAll('td[aria-selected="true"]')].map(
      (td) => td.querySelector("button")!.dataset.date,
    );
    expect(selected).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(cell("2026-11-10").getAttribute("aria-selected")).toBe("false");
  });

  test("a range set from outside turns the page to it, and the keys start from it", async () => {
    state.dates = { start: START.add({ months: 2 }), end: START.add({ months: 2, days: 1 }) };
    await nextTick();
    expect(document.querySelector("h3")!.textContent).toBe("January 2027");
    expect(cell("2027-01-03").classList.contains("start")).toBe(true);
    expect(document.querySelector('[tabindex="0"]')?.getAttribute("data-date")).toBe("2027-01-03");
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
    expect(cell("2026-11-03").classList.contains("start")).toBe(true);
    await userEvent.click(day("2026-11-12"));
    expect(state.day.toString()).toBe("2026-11-12");
    expect(cell("2026-11-12").classList.contains("start")).toBe(true);
    expect(cell("2026-11-03").classList.contains("start")).toBe(false);
    expect(banded()).toEqual([]);
  });

  test("a day set from outside turns the page to it", async () => {
    state.range = false;
    await nextTick();
    state.day = START.add({ months: 1, days: 2 });
    await nextTick();
    expect(document.querySelector("h3")!.textContent).toBe("December 2026");
    expect(cell("2026-12-05").classList.contains("start")).toBe(true);
  });

  test("today is read again when the page comes back into view", async () => {
    const marked = () => document.querySelector('[aria-current="date"]')?.getAttribute("data-date");
    expect(marked()).not.toBe("2026-11-12");
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 12, 12) });
    document.dispatchEvent(new Event("visibilitychange"));
    await nextTick();
    expect(marked()).toBe("2026-11-12");
  });
});
