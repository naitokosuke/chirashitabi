import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { musea } from "@vizejs/vite-plugin-musea";
import { defineConfig } from "@vizejs/vite-plugin/vite-plus";
import { msw } from "msw/vite";
import { defineProject, type Plugin } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import VueRouter from "vue-router/vite";

// scripts/dev-access.mjs stands in for Access on a laptop and leaves a signed token here
const devToken = existsSync(".dev-token.local")
  ? readFileSync(".dev-token.local", "utf8").trim()
  : null;

/**
 * The service worker (src/app/sw.js) as /sw.js, keeping every file this build emitted; a build
 * that emits other files names another cache, and the old one is dropped
 */
const serviceWorker: Plugin = {
  name: "chirashitabi:sw",
  apply: "build",
  enforce: "post",
  generateBundle(_, bundle) {
    const shell = [
      "/",
      ...Object.keys(bundle)
        .filter((f) => f !== "index.html" && f !== "mockServiceWorker.js" && !f.endsWith(".map"))
        .map((f) => `/${f}`),
      ...readdirSync("public").map((f) => `/${f}`),
    ].sort();
    const version = createHash("sha256").update(shell.join("\n")).digest("hex").slice(0, 12);
    this.emitFile({
      type: "asset",
      fileName: "sw.js",
      source: readFileSync("src/app/sw.js", "utf8")
        .replace("self.__SHELL__", JSON.stringify(shell))
        .replace("self.__VERSION__", JSON.stringify(version)),
    });
  },
};

export default defineConfig({
  plugins: [
    // the routes are the files in src/app/pages, typed in src/app/typed-router.d.ts; every page
    // is in the bundle, so moving between them never waits on a chunk, but the map: MapLibre is
    // over half the bundle, so it is a chunk of its own, loaded when the map is first opened (the
    // service worker keeps it with the rest). A folder named `__*` is not a route; `__params`
    // holds the param parsers (`[roomId=roomId]`), beside the pages
    VueRouter({
      routesFolder: "src/app/pages",
      dts: "src/app/typed-router.d.ts",
      importMode: (filepath) => (filepath.endsWith("/map.vue") ? "async" : "sync"),
      exclude: ["**/__*/**"],
      experimental: { paramParsers: { dir: "src/app/pages/__params" } },
    }),
    // serves the mock service worker in dev and emits it beside a bundle that imports
    // virtual:msw (src/app/mocks/), so no copy of it is committed
    msw(),
    serviceWorker,
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
  // what a build is made of (Vite DevTools, served at localhost:9999 once the build ends); only
  // under `vp run analyze`, so a deploy neither carries it nor waits on it
  devtools: process.env.ANALYZE === "true" && { apply: "build" },
  // the licenses of every dependency bundled into the build, as dist/.vite/license.md:
  // their notices travel with the code that carries them
  build: { license: true },
  compiler: { vapor: true },
  // a module's own tests (import.meta.vitest) are left out of the build
  define: { "import.meta.vitest": "undefined" },
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
          // a module may keep its tests in itself, under `if (import.meta.vitest !== undefined)`
          includeSource: ["{src,worker}/**/*.ts"],
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
      // a value is checked into its type, never asserted: `as` narrows only where a brand is
      // minted (each such line says so), and `!` not at all
      "typescript/no-unsafe-type-assertion": "error",
      "typescript/no-non-null-assertion": "error",
      "typescript/no-unnecessary-type-assertion": "error",
      // nor does `any` leak in (src/util/reset.ts types JSON as `unknown`)
      "typescript/no-explicit-any": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
    },
    overrides: [
      {
        // a test's fixtures stand for values the app would have checked
        files: ["**/*.test.ts", "**/harness.ts"],
        rules: {
          "typescript/no-unsafe-type-assertion": "off",
          "typescript/no-non-null-assertion": "off",
          // and the test framework's own `any` (expect.any, getEnv) is theirs to use
          "typescript/no-unsafe-argument": "off",
          "typescript/no-unsafe-assignment": "off",
          "typescript/no-unsafe-call": "off",
          "typescript/no-unsafe-member-access": "off",
          "typescript/no-unsafe-return": "off",
        },
      },
      {
        // no-unsafe-type-assertion needs type information, which oxlint has for .ts only, and
        // Vize has no rule for `as`: in a .vue script no assertion is made at all (`as const` is not one)
        files: ["**/*.vue"],
        rules: {
          "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
        },
      },
      {
        // plain JavaScript (the service worker, scripts/): nothing in it is typed to check
        files: ["**/*.js", "**/*.mjs"],
        rules: {
          "typescript/no-unsafe-argument": "off",
          "typescript/no-unsafe-assignment": "off",
          "typescript/no-unsafe-call": "off",
          "typescript/no-unsafe-member-access": "off",
          "typescript/no-unsafe-return": "off",
        },
      },
    ],
    options: { typeAware: true, typeCheck: true },
    vue: {
      preset: "opinionated",
      rules: {
        // I don't like this rule🫠
        "vue/multi-word-component-names": "off",
        // :items rather than :items="items", on components and native elements alike; the preset only warns
        "vue/prefer-props-shorthand": "error",
        // the oxlint rule above reads .ts only; this one reads .vue scripts and template conditions
        "type/strict-boolean-expressions": "error",
        // props and emits are declared with types, and a promise is awaited or let go with `void`
        "type/require-typed-props": "error",
        "type/require-typed-emits": "error",
        "type/no-floating-promises": "error",
      },
      ruleOptions: {
        "type/strict-boolean-expressions": {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
        },
      },
    },
  },
  fmt: {
    vue: true,
    // written by vue-router's plugin on every build, as it writes it
    // and the airports, as scripts/airports.mjs writes them: one line, kept small
    ignorePatterns: ["src/app/typed-router.d.ts", "src/contract/airports-data.json"],
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
