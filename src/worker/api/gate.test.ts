import { describe, expect, test } from "vite-plus/test";

import { APP, ME, post, server, token, useWorker } from "./harness";

useWorker();

describe("the gate", () => {
  test("no token is 401, whatever else is right", async () => {
    const res = await server.fetch(`${APP}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: APP },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  test("a token from another origin is 403", async () => {
    const res = await post("/api/rooms", ME, {}, { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  test("a GET, which a cross-site page could send without Origin, is 403", async () => {
    const res = await server.fetch(`${APP}/api/rooms`, {
      headers: { "Cf-Access-Jwt-Assertion": await token(ME), Origin: APP },
    });
    expect(res.status).toBe(403);
  });

  test("the app shell is served without the API's checks", async () => {
    const res = await server.fetch(`${APP}/some/deep/link`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("the app's files run only the build's scripts, are framed by nobody and are not sniffed", async () => {
    for (const path of ["/", "/rooms/x", "/theme.js", "/sw.js"]) {
      const res = await server.fetch(`${APP}${path}`);
      expect(res.status).toBe(200);
      const csp = res.headers.get("content-security-policy") ?? "";
      for (const directive of [
        "script-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "connect-src 'self' wss://chirashitabi.app https://tiles.openfreemap.org",
      ])
        expect(csp.split("; ")).toContain(directive);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("same-origin");
    }
    // the page the build wrote has no inline script for the policy to refuse
    const page = await (await server.fetch(`${APP}/`)).text();
    expect(page.match(/<script(?![^>]*\ssrc=)[^>]*>/g)).toBeNull();
  });

  test("the booklet host serves no app, no API and no booklet that is not published", async () => {
    for (const path of ["/", "/api/me", "/r/anything/shiori", "/r/AAAAAAAAAAAAAAAAAAAAAA/shiori"]) {
      const res = await server.fetch(`https://shiori.chirashitabi.app${path}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    const robots = await server.fetch("https://shiori.chirashitabi.app/robots.txt");
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  });
});
