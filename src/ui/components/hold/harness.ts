import { reactive } from "vue";

/** What hold.browser.test.ts watches on HoldHarness.vue: how often the button acted */
export const HOLD_TIME = 400;
export const state = reactive({ held: 0 });
