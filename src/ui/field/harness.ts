import { reactive } from "vue";

/** What chip-input.browser.test.ts watches on ChipInputHarness.vue: the word written, and how often it was committed */
export const state = reactive({ word: "", committed: 0 });
