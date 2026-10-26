import { createVaporApp, vaporInteropPlugin, type VaporComponent } from "vue";

import { createPinia } from "pinia";

import { PiniaColada } from "@pinia/colada";

import { useI18n } from "./i18n/useI18n";
import "../ui/styles/index.css";

import App from "./App.vue";
import { useRoom } from "./features/sync/useRoom";
import { useToast } from "./features/toast/useToast";
import { openWhereLeft, router } from "./router";
import "./style.css";

// Pinia Colada after Pinia, which it stores its cache in (docs/data-fetching.md).
// No plugins: in particular no retry, since some mutations are paid calls.
// The router draws the pages (pages/, router.ts), its views being components of the classic
// runtime, which the interop plugin lets a Vapor app mount.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tsc types a .vue as the classic DefineComponent; Vize compiles this one as Vapor
const app = createVaporApp(App as VaporComponent)
  .use(createPinia())
  .use(PiniaColada)
  .use(vaporInteropPlugin)
  .use(router);

// What a component, a hook or a watcher throws that nothing caught (no view has an
// onErrorCaptured): said in the toast, and in full on the console
app.config.errorHandler = (err) => {
  console.error(err);
  useToast().show(useI18n().t("common.failed"));
};

// Unless VITE_MOCK=false, `/api` and the room's socket are answered in the page (mocks/), and
// the app talks to them as it would to the Worker; the mocks are not bundled otherwise.
if (import.meta.env.VITE_MOCK !== "false") {
  const { startMocks } = await import("./mocks");
  await startMocks();
}

// The files that draw the app, kept for the trip with no connection (sw.js); only against the
// Worker, since a scope has one service worker and MSW's is the mocks'
if (import.meta.env.PROD && import.meta.env.VITE_MOCK === "false" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // not kept: the app still runs while the connection does
  });
}

await openWhereLeft(router, useRoom());

app.mount("#app");
