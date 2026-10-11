import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { acceptedLocation, expand, placeName } from "./expand";

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

describe("placeName", () => {
  test("the name a link is about: its q, else the place in its path", () => {
    expect(placeName("https://maps.google.com/?q=Hotel+Proverbs+Taipei&ftid=0x1:0x2")).toBe(
      "Hotel Proverbs Taipei",
    );
    expect(
      placeName(
        "https://www.google.com/maps/place/%E8%B1%A1%E5%B1%B1+Hotel/data=!4m2!3m1!1s0x3442:0x1?entry=gps",
      ),
    ).toBe("象山 Hotel");
    expect(placeName("https://www.google.com/maps/search/Din+Tai+Fung/")).toBe("Din Tai Fung");
  });

  test("a link with no name, or only a point, names nothing", () => {
    expect(placeName("https://www.google.com/maps/search/25.0416,+121.5489")).toBeNull();
    expect(placeName("https://www.google.com/maps/@25.04,121.55,15z")).toBeNull();
    expect(placeName("not a url")).toBeNull();
  });
});
