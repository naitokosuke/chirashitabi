import { reactive } from "vue";

/** What swipe.browser.test.ts watches on SwipeRowHarness.vue: whether the row is open, and the action taken */
export const state = reactive({ open: false, taken: 0 });
