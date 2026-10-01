import { defineConfig } from "@vizejs/vite-plugin/vite-plus";

export default defineConfig({
  compiler: { vapor: true },
  typecheck: true,
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^(@/|@ui/|~/|#)", message: "Use a relative path." }] },
      ],
    },
    options: { typeAware: true, typeCheck: true },
    vize: {
      preset: "opinionated",
      // I don't like this rule🫠
      rules: { "vue/multi-word-component-names": "off" },
    },
  },
  fmt: {
    vize: true,
    // Farthest first: the further an import is from this module, the higher it sits
    sortImports: {
      customGroups: [
        { groupName: "temporal", elementNamePattern: ["temporal-polyfill-lite"] },
        { groupName: "vue", elementNamePattern: ["vue"] },
        { groupName: "pinia", elementNamePattern: ["pinia"] },
        { groupName: "ui", elementNamePattern: ["**/ui/**"] },
        { groupName: "shared", elementNamePattern: ["**/shared/**"] },
      ],
      groups: [
        "builtin",
        "temporal",
        "vue",
        "pinia",
        "external",
        "ui",
        "shared",
        "parent",
        ["sibling", "index"],
        "unknown",
      ],
    },
  },
  server: {
    // later: proxy /api to `wrangler dev` so the WebSocket room works locally
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
