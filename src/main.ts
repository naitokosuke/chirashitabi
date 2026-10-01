import { createVaporApp, type VaporComponent } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./style.css";

const app = createVaporApp(App as VaporComponent).use(createPinia());

// No room backend yet, so boot with mock data. VITE_MOCK=false starts empty,
// and the mocks are not bundled then.
if (import.meta.env.VITE_MOCK !== "false") {
  const { installMocks } = await import("./mocks");
  installMocks();
}

app.mount("#app");
