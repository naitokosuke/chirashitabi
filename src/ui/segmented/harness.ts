import { reactive } from "vue";

/** What segmented.browser.test.ts turns on SegmentedHarness.vue: the option picked */
export const OPTIONS = [
  { value: "edit", label: "Edit" },
  { value: "read", label: "Read" },
];
export const state = reactive({ picked: "edit" });
