import { reactive } from "vue";

import type { CtOption } from "../../types";

/** What pick.browser.test.ts turns on ChipPickHarness.vue: the option picked */
export const OPTIONS: CtOption[] = ["TWD", "JPY", "USD", "EUR"].map((c) => ({
  value: c,
  label: c,
}));
export const state = reactive({ picked: "TWD" });
