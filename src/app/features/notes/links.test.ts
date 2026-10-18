import { describe, expect, test } from "vite-plus/test";

import { segments, siteOf } from "./links";

describe("segments", () => {
  test("the words around each link stay words; a stop after a link is the sentence's", () => {
    expect(segments("see https://example.com/a?b=1, then https://x.jp/日本語。 end")).toEqual([
      { at: 0, kind: "text", text: "see " },
      { at: 4, kind: "link", url: "https://example.com/a?b=1" },
      { at: 29, kind: "text", text: ", then " },
      { at: 36, kind: "link", url: "https://x.jp/日本語" },
      { at: 52, kind: "text", text: "。 end" },
    ]);
  });

  test("no link: the words as they are; a link alone: the link alone", () => {
    expect(segments("plain words")).toEqual([{ at: 0, kind: "text", text: "plain words" }]);
    expect(segments("https://a.example")).toEqual([
      { at: 0, kind: "link", url: "https://a.example" },
    ]);
    expect(segments("")).toEqual([]);
  });

  test("a bracket closing after the address is not the address's", () => {
    expect(segments("（https://a.example/p）")).toEqual([
      { at: 0, kind: "text", text: "（" },
      { at: 1, kind: "link", url: "https://a.example/p" },
      { at: 20, kind: "text", text: "）" },
    ]);
  });
});

test("siteOf", () => {
  expect(siteOf("https://www.youtube.com/watch?v=x")).toBe("youtube.com");
  expect(siteOf(null)).toBe("");
});
