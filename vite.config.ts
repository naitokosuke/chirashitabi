import { existsSync, readFileSync } from "node:fs";

import { musea } from "@vizejs/vite-plugin-musea";
import { defineConfig } from "@vizejs/vite-plugin/vite-plus";
import { msw } from "msw/vite";
import { defineProject } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
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
    // serves the mock service worker in dev and emits it beside a bundle that imports
    // virtual:msw (src/app/mocks/), so no copy of it is committed
    msw(),
    // the component gallery (Musea) at /__musea__, from the *.art.vue beside each component;
    // only under `vp run musea`, so neither `vp dev` nor a deploy carries it
    ...(process.env.MUSEA === "true"
      ? musea({
          include: ["src/ui/**/*.art.vue"],
          previewCss: ["src/ui/styles/index.css"],
          previewSetup: "src/ui/musea.preview.ts",
          theme: "system",
        })
      : []),
  ],
  compiler: { vapor: true },
  typecheck: true,
  // the tests run in Node, but a `*.browser.test.ts` in a real Chromium: what a pointer does
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["{src,worker}/**/*.test.ts"],
          exclude: ["**/*.browser.test.ts"],
        },
      },
      // vite-plus's defineProject, which lets the browser resolve vitest (a dependency of
      // vite-plus, not of this project); Vize's defineConfig above does not
      {
        extends: true,
        ...defineProject({
          test: {
            name: "browser",
            include: ["src/**/*.browser.test.ts"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: "chromium" }],
            },
          },
        }),
      },
    ],
  },
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
