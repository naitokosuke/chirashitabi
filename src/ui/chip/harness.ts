import { reactive } from "vue";

/** What chip-pick.browser.test.ts turns on ChipPickHarness.vue: the option picked */
export const OPTIONS = ["TWD", "JPY", "USD", "EUR"].map((c) => ({
  value: c,
  label: c,
}));
export const state = reactive({ picked: "TWD" });
