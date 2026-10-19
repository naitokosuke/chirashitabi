import { reactive } from "vue";

/** What dock.browser.test.ts turns on DockHarness.vue: which item is open, and whether the tabs are unfolded */
export const state = reactive<{ current: string | null; open: boolean }>({
  current: "canvas",
  open: true,
});
