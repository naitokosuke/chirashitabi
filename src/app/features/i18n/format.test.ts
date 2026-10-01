import { MessageFormat } from "messageformat";
import { describe, expect, test } from "vite-plus/test";

import { format, MESSAGES, segments } from "./format";
import { LOCALES, matchLocale } from "./locale";

// bidi isolation marks around placeholders; they are right in the UI, noise in a comparison
const plain = (s: string) => s.replace(/\p{Bidi_Control}/gu, "");

describe("messages", () => {
  test.each(LOCALES)("every %s message parses", (locale) => {
    for (const [id, source] of Object.entries(MESSAGES[locale])) {
      expect(() => new MessageFormat(locale, source), id).not.toThrow();
    }
  });

  test("a plural picks its form in en, while ja has only one", () => {
    expect(plain(format("en", "map.noPin", { count: 1 }))).toBe(
      "1 note has no place · long-press the map to place",
    );
    expect(plain(format("en", "map.noPin", { count: 3 }))).toBe(
      "3 notes have no place · long-press the map to place",
    );
    expect(plain(format("ja", "map.noPin", { count: 3 }))).toBe(
      "場所のないメモが 3 件 · 地図を長押しして置けます",
    );
  });
});

describe("segments", () => {
  test("cuts a message at its markup", () => {
    const out = segments("ja", "shiori.dayHeading", { n: 2, date: "11/4(水)" });
    expect(out.map((s) => ({ ...s, text: plain(s.text) }))).toMatchObject([
      { kind: "text", text: "2日目 " },
      { kind: "markup", name: "date", text: "11/4(水)" },
    ]);
  });

  test("a message without markup is one text segment", () => {
    expect(segments("en", "common.fitAll")).toEqual([{ kind: "text", at: 0, text: "Fit all" }]);
  });
});

describe("matchLocale", () => {
  test("takes the first language we have", () => {
    expect(matchLocale(["fr-FR", "ja-JP", "en-US"])).toBe("ja");
    expect(matchLocale(["en-GB"])).toBe("en");
  });

  test("falls back to en", () => {
    expect(matchLocale(["zh-TW"])).toBe("en");
    expect(matchLocale([])).toBe("en");
  });
});
