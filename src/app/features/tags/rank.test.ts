import { describe, expect, test } from "vite-plus/test";

import { fits, mention, rankTags, type TagOption } from "./rank";

const tag = (name: string, count = 1, p: number | null = null): TagOption => ({
  name,
  count,
  p,
  isNew: false,
});

describe("mention", () => {
  test("a tag written in the text is named in full, whatever its case", () => {
    expect(mention("Food", "street food at night")).toBe(1);
    expect(mention("ラーメン", "一蘭のラーメン屋")).toBe(1);
  });

  test("a tag only partly in the text counts for the pairs of letters it shares", () => {
    expect(mention("食べ物", "食べたい")).toBe(0.5);
  });

  test("a tag of one letter is named only when written; nothing in common is nothing", () => {
    expect(mention("茶", "お茶")).toBe(1);
    expect(mention("茶", "コーヒー")).toBe(0);
    expect(mention("Taipei", "鼎泰豊")).toBe(0);
  });

  test("less than half the pairs in common is chance, and counts for nothing", () => {
    expect(mention("Beer", "sweets")).toBe(0);
  });
});

describe("rankTags", () => {
  test("with nothing written, the most used come first and ties keep their order", () => {
    const ranked = rankTags([tag("a", 1), tag("b", 5), tag("c", 1)], "");
    expect(ranked.map((o) => o.name)).toEqual(["b", "a", "c"]);
  });

  test("a tag the text names goes ahead of one used more", () => {
    const ranked = rankTags([tag("Food", 9), tag("Night market", 1)], "night market in Shilin");
    expect(ranked.map((o) => o.name)).toEqual(["Night market", "Food"]);
  });

  test("what Clef found likely moves up, the likelier the higher", () => {
    const ranked = rankTags([tag("a", 9), tag("b", 1, 0.6), tag("c", 1, 0.9)], "");
    expect(ranked.map((o) => o.name)).toEqual(["c", "b", "a"]);
  });
});

describe("fits", () => {
  test("a tag fits when the text names half of it or more, or Clef judged it", () => {
    expect(fits(tag("Food"), "food")).toBe(true);
    expect(fits(tag("Food", 1, 0.6), "")).toBe(true);
    expect(fits(tag("Food"), "")).toBe(false);
  });
});
