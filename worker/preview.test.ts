import { describe, expect, test } from "vite-plus/test";

import { decodeEntities, previewable, readHead, siteOf } from "./preview";

const OURS = ["chirashitabi.app", "shiori.chirashitabi.app"];

describe("previewable", () => {
  test("a public http(s) page, its fragment dropped", () => {
    expect(previewable("https://example.com/post/1#top", OURS)?.href).toBe(
      "https://example.com/post/1",
    );
    expect(previewable("http://blog.example.co.jp/a?b=c", OURS)?.href).toBe(
      "http://blog.example.co.jp/a?b=c",
    );
  });

  test("not a scheme that is no page, an address by number, a bare name, or one of ours", () => {
    for (const url of [
      "javascript:alert(1)",
      "ftp://example.com/x",
      "https://10.0.0.1/admin",
      "https://localhost/x",
      "https://router.local/",
      "https://intranet/",
      "https://chirashitabi.app/rooms/x",
      "https://shiori.chirashitabi.app/r/x/shiori",
      "https://evil.chirashitabi.app/",
      "not a url",
    ])
      expect(previewable(url, OURS)).toBeNull();
  });
});

describe("readHead", () => {
  test("Open Graph first, whatever the attributes' order and quotes; the plain tags after", () => {
    const html = `<html><head>
      <title>Plain &amp; title</title>
      <meta name="description" content="plain description">
      <meta content='OG &quot;title&quot;' property='og:title' />
      <meta property="og:description" content="  a line
        on two  ">
      <meta property=og:image content=https://cdn.example.com/a.jpg>
      <meta property="og:title" content="a second one, ignored">
    </head><body>${"x".repeat(10)}</body></html>`;
    expect(readHead(html)).toEqual({
      title: 'OG "title"',
      description: "a line on two",
      image: "https://cdn.example.com/a.jpg",
    });
  });

  test("without Open Graph: the title tag and the description; nothing is null", () => {
    expect(readHead("<title>Only &#x5B89; &#23433;</title>")).toEqual({
      title: "Only 安 安",
      description: null,
      image: null,
    });
    expect(readHead("<p>no head</p>")).toEqual({ title: null, description: null, image: null });
  });

  test("a title is cut to 200 characters, a description to 1000", () => {
    const html = `<meta property="og:title" content="${"t".repeat(300)}"><meta property="og:description" content="${"d".repeat(1200)}">`;
    const head = readHead(html);
    expect(head.title).toHaveLength(200);
    expect(head.description).toHaveLength(1000);
  });
});

test("decodeEntities and siteOf", () => {
  expect(decodeEntities("a &lt;b&gt; &amp; &quot;c&quot; &apos;d&apos;&nbsp;&unknown;")).toBe(
    `a <b> & "c" 'd' &unknown;`,
  );
  expect(siteOf(new URL("https://www.youtube.com/watch?v=x"))).toBe("youtube.com");
  expect(siteOf(new URL("https://tabelog.com/x"))).toBe("tabelog.com");
});
