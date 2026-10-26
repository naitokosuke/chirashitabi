import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import {
  decodeEntities,
  PAGE_BYTES,
  preview,
  previewable,
  readHead,
  readUpTo,
  siteOf,
  youtubeWatch,
} from "./preview";

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

describe("readUpTo", () => {
  /** A request's body of `chunks` chunks of `size` bytes, and how many were read from it */
  const streamed = (chunks: number, size: number) => {
    const pulled = { n: 0 };
    // nothing is pulled before it is read
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (pulled.n === chunks) return controller.close();
          pulled.n++;
          controller.enqueue(new Uint8Array(size));
        },
      },
      { highWaterMark: 0 },
    );
    // as a request streamed in says it: no Content-Length
    return { req: { headers: new Headers(), body }, pulled };
  };

  test("a body that does not say how long it is is read only until it passes the size", async () => {
    const { req, pulled } = streamed(100, 10);
    expect(await readUpTo(req, 25)).toBeNull();
    expect(pulled.n).toBe(3);
  });

  test("one within the size is read whole; cut, one past it is its first bytes", async () => {
    expect(await readUpTo(streamed(3, 10).req, 30)).toHaveLength(30);
    expect(await readUpTo(streamed(100, 10).req, 25, true)).toHaveLength(25);
  });

  test("one that says it is longer is none, whatever came", async () => {
    const said = new Response(new Uint8Array(10), { headers: { "Content-Length": "100" } });
    expect(await readUpTo(said, 25)).toBeNull();
  });
});

test("youtubeWatch", () => {
  for (const shared of [
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ",
  ])
    expect(youtubeWatch(new URL(shared))).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  expect(youtubeWatch(new URL("https://www.youtube.com/@channel"))).toBe(
    "https://www.youtube.com/@channel",
  );
});

test("decodeEntities and siteOf", () => {
  expect(decodeEntities("a &lt;b&gt; &amp; &quot;c&quot; &apos;d&apos;&nbsp;&unknown;")).toBe(
    `a <b> & "c" 'd' &unknown;`,
  );
  expect(siteOf(new URL("https://www.youtube.com/watch?v=x"))).toBe("youtube.com");
  expect(siteOf(new URL("https://tabelog.com/x"))).toBe("tabelog.com");
});

describe("preview", () => {
  // the pages, by the host the Worker meant (preview.ts sends it in a header) and the path
  let server: Server;
  let base: string;
  const asked: { host: string | undefined; path: string }[] = [];
  const LONG = `<html><head><meta property="og:title" content="A long read"></head><body>${"x".repeat(PAGE_BYTES)}</body></html>`;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const host = req.headers["x-preview-host"];
      const path = req.url ?? "/";
      asked.push({ host: Array.isArray(host) ? host[0] : host, path });
      const away = (location: string) => {
        res.statusCode = 302;
        res.setHeader("Location", location);
        res.end();
      };
      if (path === "/to-ip") return away("https://10.0.0.1/admin");
      if (path === "/to-localhost") return away("http://localhost:8787/");
      if (path === "/to-ours") return away("https://chirashitabi.app/rooms/x");
      if (path === "/to-nowhere") return away("http://[");
      res.setHeader("Content-Type", "text/html");
      // over PAGE_BYTES, its length said, or sent in chunks with no length
      if (path === "/long") return res.end(LONG);
      if (path === "/long-chunked") {
        for (let at = 0; at < LONG.length; at += 64 * 1024)
          res.write(LONG.slice(at, at + 64 * 1024));
        return res.end();
      }
      if (path === "/bad-image")
        return res.end(
          `<meta property="og:title" content="t"><meta property="og:image" content="http://[">`,
        );
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  test("a redirect to an address by number, a local name or one of ours is not followed", async () => {
    for (const path of ["/to-ip", "/to-localhost", "/to-ours"])
      expect(await preview(`https://blog.example.com${path}`, OURS, base)).toBeNull();
    expect(asked.map((a) => a.host)).not.toContain("10.0.0.1");
    expect(asked.map((a) => a.host)).not.toContain("localhost");
    expect(asked.map((a) => a.host)).not.toContain("chirashitabi.app");
  });

  test("a Location or a picture that is no address is no page and no picture, not an error", async () => {
    expect(await preview("https://blog.example.com/to-nowhere", OURS, base)).toBeNull();
    expect(await preview("https://blog.example.com/bad-image", OURS, base)).toMatchObject({
      title: "t",
      image: null,
    });
  });

  test("a page over PAGE_BYTES is read to there, and previewed from its head", async () => {
    for (const path of ["/long", "/long-chunked"])
      expect(await preview(`https://blog.example.com${path}`, OURS, base)).toMatchObject({
        title: "A long read",
      });
  });
});
