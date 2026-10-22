import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import "../styles/index.css";

import ChipInputHarness from "./ChipInputHarness.vue";
import { state } from "./harness";

/** The chip line in Chromium: Enter commits the word, but not the Enter that ends an IME conversion */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  state.word = "";
  state.committed = 0;
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(ChipInputHarness as VaporComponent);
  app.mount(root);
  await nextTick();
});
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

const enter = (init: KeyboardEventInit) =>
  document
    .querySelector("input")!
    .dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", ...init }),
    );

describe("Enter", () => {
  test("commits the word", () => {
    enter({});
    expect(state.committed).toBe(1);
  });

  test("confirming an IME conversion does not, whether it says it is composing or not (Safari)", () => {
    enter({ isComposing: true });
    enter({ keyCode: 229 });
    expect(state.committed).toBe(0);
  });
});
