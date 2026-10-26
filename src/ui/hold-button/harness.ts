import { reactive } from "vue";

/**
 * What hold-button.browser.test.ts watches on HoldButtonHarness.vue: how often the button
 * acted; and turns: whether it is disabled, and whether what it does is its owner's to answer
 * (`owned`), as the deleted shelf's restore is. Then a full hold waits on `answer`, the test's
 * to call.
 */
interface HarnessState {
  held: number;
  disabled: boolean;
  owned: boolean;
  answer: ((ok: boolean) => void) | null;
}
export const HOLD_TIME = 400;
export const state = reactive<HarnessState>({
  held: 0,
  disabled: false,
  owned: false,
  answer: null,
});
