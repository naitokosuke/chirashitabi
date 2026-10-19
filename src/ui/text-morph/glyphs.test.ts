import { describe, expect, test } from "vite-plus/test";

import { align, flatten, graphemes, type Glyph } from "./glyphs";

function counter(from = 100) {
  let n = from;
  return () => n++;
}
const row = (text: string, tone = "") => align([], flatten([{ text, tone }]), counter(0));
const kept = (prev: Glyph[], next: Glyph[]) =>
  next
    .filter((g) => prev.some((p) => p.id === g.id))
    .map((g) => g.ch)
    .join("");
const arrived = (prev: Glyph[], next: Glyph[]) =>
  next
    .filter((g) => !prev.some((p) => p.id === g.id))
    .map((g) => g.ch)
    .join("");

describe("align", () => {
  test("only the changed characters are new: the day number, the date's last digit, the weekday", () => {
    const prev = row("1日目 11/3(火)");
    const next = align(prev, flatten([{ text: "2日目 11/4(水)" }]), counter());
    expect(next.map((g) => g.ch).join("")).toBe("2日目 11/4(水)");
    expect(kept(prev, next)).toBe("日目 11/()");
    expect(arrived(prev, next)).toBe("24水");
  });

  test("a character in another tone is another character", () => {
    const prev = align([], flatten([{ text: "1" }, { text: "1", tone: "date" }]), counter(0));
    const next = align(prev, flatten([{ text: "1", tone: "date" }]), counter());
    expect(next).toEqual([{ id: prev[1]!.id, ch: "1", tone: "date" }]);
  });

  test("the same text keeps every id", () => {
    const prev = row("Day 2");
    expect(align(prev, flatten([{ text: "Day 2" }]), counter())).toEqual(prev);
  });

  test("nothing in common: all new", () => {
    const prev = row("3日目");
    expect(arrived(prev, align(prev, flatten([{ text: "付録" }]), counter()))).toBe("付録");
  });
});

describe("graphemes", () => {
  test("an emoji with a modifier is one character", () => {
    expect(graphemes("a👍🏽b")).toEqual(["a", "👍🏽", "b"]);
  });
});
