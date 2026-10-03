import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "vite-plus/test";

/*
 * A named media query (`@media (--wide)`) that LightningCSS cannot resolve is left as it is,
 * and a browser treats it as a query that never matches: no error, no warning, a style that
 * silently never applies. So every name used must be defined in media.css, and every
 * stylesheet that uses one must import media.css (definitions are per stylesheet).
 */

const SRC = join(import.meta.dirname, "../..");
const MEDIA = join(import.meta.dirname, "media.css");

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(vue|css)$/.test(entry.name)) yield path;
  }
}

const defined = new Set(
  [...readFileSync(MEDIA, "utf8").matchAll(/@custom-media\s+(--[\w-]+)/g)].map((m) => m[1]),
);

/** The stylesheets of a file: the file itself, or each <style> block of a .vue */
const sheets = (path: string, text: string) =>
  path.endsWith(".vue")
    ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? "")
    : [text];

const uses = (css: string) =>
  [...css.matchAll(/@media[^{]*\((--[\w-]+)\)/g)].map((m) => m[1] ?? "");

describe("named media queries", () => {
  const users = [...files(SRC)]
    .filter((path) => path !== MEDIA)
    .flatMap((path) =>
      sheets(path, readFileSync(path, "utf8"))
        .filter((css) => uses(css).length > 0)
        .map((css) => ({ file: relative(SRC, path), css })),
    );

  test("there are some, or this test checks nothing", () => {
    expect(users.length).toBeGreaterThan(0);
  });

  test.each(users)("$file uses only names media.css defines", ({ css }) => {
    expect(uses(css).filter((name) => !defined.has(name))).toEqual([]);
  });

  test.each(users)("$file imports media.css where it uses them", ({ css }) => {
    expect(css).toMatch(
      /@import\s+["'][./]*(?:ui\/)?styles\/media\.css["']|@import\s+["']\.\/media\.css["']/,
    );
  });
});
