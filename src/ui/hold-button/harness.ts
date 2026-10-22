import { reactive } from "vue";

/**
 * What hold-button.browser.test.ts watches on HoldButtonHarness.vue: how often the button
 * acted; and turns: whether it is disabled
 */
export const HOLD_TIME = 400;
export const state = reactive({ held: 0, disabled: false });
