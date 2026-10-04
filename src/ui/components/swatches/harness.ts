import { reactive } from "vue";

/** What swatches.browser.test.ts turns on SwatchesHarness.vue: the color picked */
export const COLORS = ["#3c6ee0", "#d7263d", "#1b998b", "#f4a261"] as const;
export const state = reactive({ selected: COLORS[0] as string });
