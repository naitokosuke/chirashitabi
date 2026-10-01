import { createVaporApp, type VaporComponent } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./style.css";

createVaporApp(App as VaporComponent)
  .use(createPinia())
  .mount("#app");
