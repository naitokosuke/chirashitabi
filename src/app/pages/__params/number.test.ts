import { describe, expect, test } from "vite-plus/test";

import { parser } from "./number";

describe("the number param", () => {
  test("a finite number, and back to the same string", () => {
    expect(parser.get?.("25.03")).toBe(25.03);
    expect(parser.get?.("0")).toBe(0);
    expect(parser.set?.(121.56)).toBe("121.56");
  });

  test("an empty or blank value, or one that is not a finite number, is none", () => {
    expect(() => parser.get?.("")).toThrow();
    expect(() => parser.get?.(" ")).toThrow();
    expect(() => parser.get?.("\t\n")).toThrow();
    expect(() => parser.get?.("east")).toThrow();
    expect(() => parser.get?.("Infinity")).toThrow();
  });

  test("a key with no value (`?lat`) is null, never 0", () => {
    expect(parser.get?.(null)).toBeNull();
    expect(parser.get?.(undefined)).toBeNull();
  });
});
