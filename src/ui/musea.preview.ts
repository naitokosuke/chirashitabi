import { vaporInteropPlugin, type App } from "vue";

/** Musea mounts each variant in a classic app; the components are Vapor, which the interop plugin lets it mount */
export default function setup(app: App) {
  app.use(vaporInteropPlugin);
}
