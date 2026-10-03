import { createVaporApp, type VaporComponent } from "vue";

import { createPinia } from "pinia";

import { PiniaColada } from "@pinia/colada";

import App from "./App.vue";
import "../ui/styles/index.css";

import "./style.css";

// Pinia Colada after Pinia, which it stores its cache in (docs/data-fetching.md).
// No plugins: in particular no retry, since some mutations are paid calls.
const app = createVaporApp(App as VaporComponent)
  .use(createPinia())
  .use(PiniaColada);

// No room backend yet, so boot with mock data. VITE_MOCK=false starts empty,
// and the mocks are not bundled then.
if (import.meta.env.VITE_MOCK !== "false") {
  const { installMocks } = await import("./mocks");
  installMocks();
}

app.mount("#app");
