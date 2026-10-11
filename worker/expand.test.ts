import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { acceptedLocation, expand } from "./expand";

describe("acceptedLocation", () => {
  test("Google Maps itself, on any of Google's country hosts", () => {
    for (const ok of [
      "https://www.google.com/maps/search/25.0416,+121.5489?entry=tts",
      "https://maps.google.com/?q=25.04,121.55",
      "https://www.google.com.tw/maps/place/Hotel/@25.04,121.55,17z",
      "https://google.co.jp/maps/@35.6,139.7,15z",
    ])
      expect(acceptedLocation(ok)).toBe(new URL(ok).href);
  });

  test("a Google Maps Go wrapper is unwrapped and held to the same rule", () => {
    const inner = "https://www.google.com/maps/place/x/@25.04,121.55,17z";
    expect(acceptedLocation(`https://maps.app.goo.gl/?link=${encodeURIComponent(inner)}`)).toBe(
      inner,
    );
    expect(
      acceptedLocation(
        `https://maps.app.goo.gl/?link=${encodeURIComponent("https://evil.example/")}`,
      ),
    ).toBeNull();
  });

  test("anything else is not taken", () => {
    for (const bad of [
      null,
      "not a url",
      "http://www.google.com/maps",
      "https://google.com.evil.example/maps",
      "https://evilgoogle.com/maps",
      "https://consent.google.com/ml?continue=x",
      "javascript:alert(1)",
    ])
      expect(acceptedLocation(bad)).toBeNull();
  });
});

describe("expand", () => {
  let server: Server;
  let base: string;
  const seen: { path: string; agent: string | undefined }[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({ path: req.url ?? "", agent: req.headers["user-agent"] });
      if (req.url === "/abc") {
        res.statusCode = 302;
        res.setHeader("Location", "https://www.google.com/maps/search/25.0416,+121.5489?g_st=ic");
      } else if (req.url === "/away") {
        res.statusCode = 302;
        res.setHeader("Location", "https://evil.example/");
      } else res.statusCode = 200;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  test("a short link becomes the Google Maps link its redirect names, read and not followed", async () => {
    expect(await expand("https://maps.app.goo.gl/abc", base)).toBe(
      "https://www.google.com/maps/search/25.0416,+121.5489?g_st=ic",
    );
    expect(seen.at(-1)).toMatchObject({ path: "/abc", agent: expect.stringContaining("Mozilla") });
  });

  test("a redirect elsewhere, no redirect, or a link that is not a short one gives nothing", async () => {
    expect(await expand("https://maps.app.goo.gl/away", base)).toBeNull();
    expect(await expand("https://maps.app.goo.gl/page", base)).toBeNull();
    const asked = seen.length;
    expect(await expand("https://evil.example/abc", base)).toBeNull();
    expect(seen.length).toBe(asked);
  });
});
