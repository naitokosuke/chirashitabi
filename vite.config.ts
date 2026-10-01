import { defineConfig } from "@vizejs/vite-plugin/vite-plus";
import { fileURLToPath } from "node:url";

export default defineConfig({
  compiler: { vapor: true },
  typecheck: true,
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    vize: {
      preset: "opinionated",
      // I don't like this rule🫠
      rules: { "vue/multi-word-component-names": "off" },
    },
  },
  fmt: { vize: true },
  resolve: {
    alias: {
      "@ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
      "@": fileURLToPath(new URL("./src/app", import.meta.url)),
    },
  },
  server: {
    // later: proxy /api to `wrangler dev` so the WebSocket room works locally
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
