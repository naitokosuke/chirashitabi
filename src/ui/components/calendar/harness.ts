import { Temporal } from "temporal-polyfill-lite";

import { reactive } from "vue";

import type { DateRange } from "./calendar";

/** What calendar.browser.test.ts turns on CalendarHarness.vue: the day picked, and the range */
export const START = Temporal.PlainDate.from("2026-11-03");
export const state = reactive<{ range: boolean; day: Temporal.PlainDate; dates: DateRange }>({
  range: true,
  day: START,
  dates: { start: START, end: START.add({ days: 3 }) },
});
