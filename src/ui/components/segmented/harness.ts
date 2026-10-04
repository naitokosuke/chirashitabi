import { reactive } from "vue";

import type { CtOption } from "../../types";

/** What segmented.browser.test.ts turns on SegmentedHarness.vue: the option picked */
export const OPTIONS: CtOption[] = [
  { value: "edit", label: "Edit" },
  { value: "read", label: "Read" },
];
export const state = reactive({ picked: "edit" });
