import { describe, expect, test } from "vite-plus/test";

import type { HttpUrl } from "../place/google-maps";

import { segments, siteOf } from "./links";

describe("segments", () => {
  test("the words around each link stay words; a stop after a link is the sentence's", () => {
    expect(segments("see https://example.com/a?b=1, then https://x.jp/日本語。 end")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", url: "https://example.com/a?b=1" },
      { kind: "text", text: ", then " },
      { kind: "link", url: "https://x.jp/日本語" },
      { kind: "text", text: "。 end" },
    ]);
  });

  test("no link: the words as they are; a link alone: the link alone", () => {
    expect(segments("plain words")).toEqual([{ kind: "text", text: "plain words" }]);
    expect(segments("https://a.example")).toEqual([{ kind: "link", url: "https://a.example" }]);
    expect(segments("")).toEqual([]);
  });

  test("a bracket closing after the address is not the address's", () => {
    expect(segments("（https://a.example/p）")).toEqual([
      { kind: "text", text: "（" },
      { kind: "link", url: "https://a.example/p" },
      { kind: "text", text: "）" },
    ]);
  });
});

test("siteOf", () => {
  expect(siteOf("https://www.youtube.com/watch?v=x" as HttpUrl)).toBe("youtube.com");
  expect(siteOf(null)).toBe("");
});
