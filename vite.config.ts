import { defineConfig } from "@vizejs/vite-plugin/vite-plus";
import { fileURLToPath } from "node:url";

export default defineConfig({
  compiler: { vapor: true },
  typecheck: true,
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    vize: { preset: "opinionated" },
  },
  fmt: { vize: true },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    // later: proxy /api to `wrangler dev` so the WebSocket room works locally
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
