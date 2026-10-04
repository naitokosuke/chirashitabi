import { describe, expect, test } from "vite-plus/test";

import { parser } from "./number";

describe("the number param", () => {
  test("a finite number, and back to the same string", () => {
    expect(parser.get?.("25.03")).toBe(25.03);
    expect(parser.set?.(121.56)).toBe("121.56");
  });

  test("an empty value, or one that is not a finite number, is none", () => {
    expect(() => parser.get?.("")).toThrow();
    expect(() => parser.get?.("east")).toThrow();
    expect(() => parser.get?.("Infinity")).toThrow();
  });
});
