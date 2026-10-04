import { existsSync, readFileSync } from "node:fs";

import { defineConfig } from "@vizejs/vite-plugin/vite-plus";
import VueRouter from "vue-router/vite";

// scripts/dev-access.mjs stands in for Access on a laptop and leaves a signed token here
const devToken = existsSync(".dev-token.local")
  ? readFileSync(".dev-token.local", "utf8").trim()
  : null;

export default defineConfig({
  plugins: [
    // the routes are the files in src/app/pages, typed in src/app/typed-router.d.ts; every page
    // is in the bundle, so moving between them never waits on a chunk
    VueRouter({
      routesFolder: "src/app/pages",
      dts: "src/app/typed-router.d.ts",
      importMode: "sync",
    }),
  ],
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
      "typescript/strict-boolean-expressions": [
        "error",
        { allowString: false, allowNumber: false, allowNullableObject: false },
      ],
    },
    options: { typeAware: true, typeCheck: true },
    vize: {
      preset: "opinionated",
      rules: {
        // I don't like this rule🫠
        "vue/multi-word-component-names": "off",
        // :items rather than :items="items"; it only looks at component props, not native attrs
        "vue/prefer-props-shorthand": "error",
      },
    },
  },
  fmt: {
    vize: true,
    // written by vue-router's plugin on every build, as it writes it
    ignorePatterns: ["src/app/typed-router.d.ts"],
    // Farthest first: the further an import is from this module, the higher it sits
    sortImports: {
      customGroups: [
        { groupName: "temporal", elementNamePattern: ["temporal-polyfill-lite"] },
        { groupName: "vue", elementNamePattern: ["vue"] },
        { groupName: "pinia", elementNamePattern: ["pinia"] },
        { groupName: "ui", elementNamePattern: ["**/ui/**"] },
        { groupName: "shared", elementNamePattern: ["**/shared/**"] },
        { groupName: "i18n", elementNamePattern: ["**/i18n/**"] },
      ],
      groups: [
        "builtin",
        "temporal",
        "vue",
        "pinia",
        "external",
        "ui",
        "shared",
        "i18n",
        "parent",
        ["sibling", "index"],
        "unknown",
      ],
    },
  },
  // LightningCSS instead of PostCSS: it resolves the named media queries in
  // src/ui/styles/media.css, which each style block that uses one imports
  css: {
    transformer: "lightningcss",
    lightningcss: { drafts: { customMedia: true } },
  },
  server: {
    // /api goes to `wrangler dev`, carrying the dev Access token when the stub is running
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        ws: true,
        headers: devToken === null ? {} : { "Cf-Access-Jwt-Assertion": devToken },
      },
    },
  },
});
