import { describe, expect, test } from "vite-plus/test";

import { safeUrl } from "./url";

describe("safeUrl", () => {
  test("a web page goes through", () => {
    expect(safeUrl("https://www.google.com/maps?q=25,121")).toBe(
      "https://www.google.com/maps?q=25,121",
    );
    expect(safeUrl("http://example.com/")).toBe("http://example.com/");
  });

  test("a path on this site goes through as written", () => {
    expect(safeUrl("/")).toBe("/");
    expect(safeUrl("/rooms/abc/home")).toBe("/rooms/abc/home");
  });

  test("anything that runs, or leaves for another host without saying how, does not", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl(" JavaScript:alert(1)")).toBeUndefined();
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeUrl("//evil.example/")).toBeUndefined();
    expect(safeUrl("/\\evil.example/")).toBeUndefined();
    expect(safeUrl("not a url")).toBeUndefined();
  });

  test("no link is none", () => {
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});
