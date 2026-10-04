import { createVaporApp, type VaporComponent } from "vue";

import { createPinia } from "pinia";

import { PiniaColada } from "@pinia/colada";

import App from "./App.vue";
import "../ui/styles/index.css";

import { useRoom } from "./features/sync/useRoom";
import { openWhereLeft, router } from "./router";
import "./style.css";

// Pinia Colada after Pinia, which it stores its cache in (docs/data-fetching.md).
// No plugins: in particular no retry, since some mutations are paid calls.
// The router keeps the URL and the history only (router.ts).
const app = createVaporApp(App as VaporComponent)
  .use(createPinia())
  .use(PiniaColada)
  .use(router);

// Unless VITE_MOCK=false, `/api` and the room's socket are answered in the page (mocks/), and
// the app talks to them as it would to the Worker; the mocks are not bundled otherwise.
if (import.meta.env.VITE_MOCK !== "false") {
  const { startMocks } = await import("./mocks");
  await startMocks();
}

await openWhereLeft(router, useRoom());

app.mount("#app");
