import { createVaporApp, nextTick, type VaporComponent } from "vue";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../styles/index.css";

import MenuHarness from "./MenuHarness.vue";

/** The menu in Chromium: ← and → walk its buttons, past one that is disabled, round the ends */
let app: ReturnType<typeof createVaporApp> | null = null;
beforeEach(async () => {
  const root = document.createElement("div");
  document.body.append(root);
  app = createVaporApp(MenuHarness as VaporComponent);
  app.mount(root);
  await nextTick();
});
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

const item = (name: string) => page.getByRole("button", { name }).element();

describe("the arrow keys", () => {
  test("walk past a disabled button, both ways and round the ends", async () => {
    (item("Rewrite") as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(item("Delete"));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(item("Rewrite"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(item("Delete"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(item("Rewrite"));
  });
});
