import { describe, expect, test } from "vite-plus/test";

import { parser } from "./sheet";

describe("the sheet param", () => {
  test("writing or editing; anything else is not a sheet", () => {
    expect(parser.get?.("write")).toBe("write");
    expect(parser.get?.("edit")).toBe("edit");
    expect(() => parser.get?.("nope")).toThrow();
    expect(() => parser.get?.(" write")).toThrow();
  });

  test("a key with no value (`?sheet`) is null", () => {
    expect(parser.get?.(null)).toBeNull();
  });
});
