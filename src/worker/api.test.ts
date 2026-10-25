import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import {
  createTestHarness,
  experimental_readRawConfig,
  type TestHarness,
  type Unstable_RawConfig,
} from "wrangler";

import type { ServerMessage } from "../contract/wire";

// The Worker runs in workerd through wrangler's test harness. Access is stood in for by
// signing tokens with a throwaway key and serving its public half from a local stub.
const TEAM = "floral-sky-5f24.cloudflareaccess.com";
const AUD = "283aabc752ef29220bf9efc1ca77335383ed2f8753a1e65e45801fbe44f4f65d";
const APP = "https://chirashitabi.app";
const KID = "test";

let privateKey: CryptoKey;
let certs: Server;
let server: TestHarness;

/**
 * Stands in for the Claude API. Each test sets how it answers; `asked` keeps the request
 * bodies it got, so a test can see what was sent and how many paid calls were made.
 */
let claude: Server;
let answer: (request: { messages: { content: string }[] }) => { status: number; body: unknown };
const asked: unknown[] = [];
/** The test's budget: paid calls one person may make in a day */
const PER_DAY = 3;

/** Stands in for Clef on Workers AI, the same way: each test sets its answer, `judged` keeps the inputs */
let clef: Server;
let judge: (input: { state: unknown; questions: Record<string, unknown>; images?: unknown[] }) => {
  status: number;
  body: unknown;
} = () => ({ status: 500, body: {} });
const judged: { state: unknown; questions: Record<string, unknown>; images?: unknown[] }[] = [];

/** Stands in for OpenStreetMap's geocoder: each test sets what a query finds; `looked` keeps the queries */
let geocoder: Server;
let find: (query: string, url: URL) => { status: number; body: unknown } = () => ({
  status: 200,
  body: [],
});
const looked: { q: string | null; lang: string | null; agent: string | undefined }[] = [];

/** Stands in for maps.app.goo.gl: every path redirects away; `followed` keeps the paths */
let shortlinks: Server;
const followed: string[] = [];
let pages: Server;
/** What the pages stub was asked for: the host the Worker meant, and the path */
const fetched: { host: string | undefined; path: string }[] = [];
/** A small PNG: eight bytes of signature and nothing else, enough for a type check */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  privateKey = pair.privateKey;
  const jwk = {
    ...((await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey),
    kid: KID,
  };

  certs = createServer((_, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => certs.listen(0, "127.0.0.1", resolve));
  const { port } = certs.address() as AddressInfo;

  claude = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as Parameters<typeof answer>[0];
      asked.push(body);
      const { status, body: out } = answer(body);
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      // bytes as they are: an answer that is no JSON
      res.end(out instanceof Uint8Array ? out : JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => claude.listen(0, "127.0.0.1", resolve));
  const claudePort = (claude.address() as AddressInfo).port;

  clef = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as (typeof judged)[number];
      judged.push(body);
      const { status, body: out } = judge(body);
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => clef.listen(0, "127.0.0.1", resolve));
  const clefPort = (clef.address() as AddressInfo).port;

  geocoder = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const q = url.searchParams.get("q");
    looked.push({
      q,
      lang: url.searchParams.get("accept-language"),
      agent: req.headers["user-agent"],
    });
    const { status, body: out } = find(q ?? "", url);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(out));
  });
  await new Promise<void>((resolve) => geocoder.listen(0, "127.0.0.1", resolve));
  const geocoderPort = (geocoder.address() as AddressInfo).port;

  shortlinks = createServer((req, res) => {
    followed.push(req.url ?? "");
    res.statusCode = 302;
    // a host that never answers: the harness follows a redirect even when told not to (expand.ts),
    // and a test must not reach Google. What a redirect is read as is expand.test.ts's to show
    res.setHeader("Location", "https://www.google.invalid/maps/search/25.0416,+121.5489");
    res.end();
  });
  await new Promise<void>((resolve) => shortlinks.listen(0, "127.0.0.1", resolve));
  const shortlinksPort = (shortlinks.address() as AddressInfo).port;

  // the pages a note may link to, by host and path: a blog with Open Graph tags, its picture,
  // a redirect, YouTube's oEmbed, and a page that is no HTML
  pages = createServer((req, res) => {
    const host = req.headers["x-preview-host"];
    const path = req.url ?? "/";
    fetched.push({ host: Array.isArray(host) ? host[0] : host, path });
    const answer = (status: number, type: string, body: string | Uint8Array) => {
      res.statusCode = status;
      res.setHeader("Content-Type", type);
      res.end(body);
    };
    if (host === "blog.example.com" && path === "/post") {
      return answer(
        200,
        "text/html; charset=utf-8",
        `<html><head><title>plain</title>
          <meta property="og:title" content="Beef noodles &amp; more">
          <meta property="og:description" content="A bowl worth the queue">
          <meta property="og:image" content="/cover.png">
          </head><body><script>alert(1)</script></body></html>`,
      );
    }
    if (host === "blog.example.com" && path === "/cover.png") return answer(200, "image/png", PNG);
    // relative: the harness follows a redirect even when told not to (as expand.ts notes), and
    // an absolute one would leave the stub; which hosts a redirect may lead to is preview.test.ts's
    if (host === "blog.example.com" && path === "/moved") {
      res.statusCode = 302;
      res.setHeader("Location", "/post");
      return res.end();
    }
    if (host === "blog.example.com" && path === "/big.png") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", String(2 * 1024 * 1024));
      return res.end(PNG);
    }
    if (host === "blog.example.com" && path === "/bigpic") {
      return answer(
        200,
        "text/html",
        `<meta property="og:title" content="Big"><meta property="og:image" content="/big.png">`,
      );
    }
    if (host === "www.youtube.com" && path.startsWith("/oembed?")) {
      return answer(
        200,
        "application/json",
        JSON.stringify({
          title: "Night market walk",
          author_name: "Some Channel",
          thumbnail_url: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
        }),
      );
    }
    // the largest 16:9 frame is not there for this video; the small one is
    if (host === "i.ytimg.com" && path.endsWith("/maxresdefault.jpg"))
      return answer(404, "text/plain", "no");
    if (host === "i.ytimg.com") return answer(200, "image/jpeg", PNG);
    if (host === "files.example.com") return answer(200, "application/pdf", "%PDF-");
    answer(404, "text/plain", "no");
  });
  await new Promise<void>((resolve) => pages.listen(0, "127.0.0.1", resolve));
  const pagesPort = (pages.address() as AddressInfo).port;

  // The Worker as it is deployed, but for its Workers AI binding: that one only runs against
  // Cloudflare (a login, which CI does not have), so Clef is the stub at CLEF_BASE_URL instead.
  // Written to a folder of its own, away from a developer's .dev.vars, with its paths made whole.
  const { ai: _remote, ...config } = experimental_readRawConfig({ config: "./wrangler.jsonc" })
    .rawConfig as Unstable_RawConfig;
  const dir = await mkdtemp(join(tmpdir(), "chirashitabi-test-"));
  const configPath = join(dir, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      ...config,
      main: resolve(config.main!),
      assets: { ...config.assets, directory: resolve(config.assets!.directory!) },
    }),
  );
  server = createTestHarness({
    workers: [
      {
        configPath,
        vars: {
          ACCESS_CERTS_URL: `http://127.0.0.1:${port}/certs`,
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${claudePort}`,
          ANTHROPIC_API_KEY: "test-key",
          CLEF_BASE_URL: `http://127.0.0.1:${clefPort}`,
          GEOCODER_BASE_URL: `http://127.0.0.1:${geocoderPort}`,
          SHORTLINK_BASE_URL: `http://127.0.0.1:${shortlinksPort}`,
          PREVIEW_BASE_URL: `http://127.0.0.1:${pagesPort}`,
          SPEND_PER_DAY: String(PER_DAY),
        },
      },
    ],
  });
  await server.listen();
}, 60_000);

afterAll(async () => {
  await server?.close();
  certs?.close();
  claude?.close();
  clef?.close();
  geocoder?.close();
  shortlinks?.close();
  pages?.close();
});

const b64url = (data: Uint8Array | string) => {
  const s = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A token Access would issue for `email` */
async function token(email: string) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
  const p = b64url(
    JSON.stringify({
      aud: [AUD],
      iss: `https://${TEAM}`,
      email,
      iat: now,
      nbf: now - 60,
      exp: now + 3600,
    }),
  );
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

/** A JSON POST the way the SPA sends one */
async function post(
  path: string,
  email: string,
  body: unknown = {},
  headers: Record<string, string> = {},
) {
  return server.fetch(`${APP}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: APP,
      "Cf-Access-Jwt-Assertion": await token(email),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const TRIP = {
  name: "Taiwan trip",
  days: ["2026-11-03", "2026-11-04", "2026-11-05"],
  currency: "TWD",
  center: { lat: 25.05, lng: 121.54 },
};
const YUKI = { name: "Yuki", color: "#3c6ee0" };
const KEN = { name: "Ken", color: "#d7263d" };

async function createRoom(email: string) {
  const res = await post("/api/rooms", email, { trip: TRIP, me: YUKI });
  expect(res.status).toBe(200);
  return (await res.json()) as { roomId: string; memberId: string };
}

const invite = (roomId: string, by: string, email: string) =>
  post(`/api/rooms/${roomId}/invite`, by, { email });
const accept = (roomId: string, email: string, profile: unknown = KEN) =>
  post(`/api/invitations/${roomId}/accept`, email, profile);

/** `email` invited by `by` and in, as `profile`: the answer to the acceptance, with the member id */
async function admit(roomId: string, by: string, email: string, profile = KEN) {
  expect((await invite(roomId, by, email)).status).toBe(200);
  return accept(roomId, email, profile);
}

/** A refusal as the app's client tells it apart: its status, and the JSON saying which it is */
const refusal = async (res: { status: number; json(): Promise<unknown> }) => [
  res.status,
  await res.json(),
];

const ME = "me@example.com";
const PARTNER = "partner@example.com";
const STRANGER = "stranger@example.com"; // allowed by Access, in no room

/** A member's socket, with its messages queued for the test to read in order */
async function connect(roomId: string, email: string) {
  const res = await server.fetch(`${APP}/api/rooms/${roomId}/ws`, {
    headers: { Upgrade: "websocket", Origin: APP, "Cf-Access-Jwt-Assertion": await token(email) },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (ws === null || ws === undefined) throw new Error("no socket on the response");
  ws.accept();
  const queue: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data as string) as ServerMessage;
    const w = waiting.shift();
    if (w === undefined) queue.push(m);
    else w(m);
  });
  const next = () =>
    new Promise<ServerMessage>((resolve, reject) => {
      const m = queue.shift();
      if (m !== undefined) return resolve(m);
      waiting.push(resolve);
      setTimeout(() => reject(new Error("no message within 2s")), 2000);
    });
  const send = (m: unknown) => ws.send(typeof m === "string" ? m : JSON.stringify(m));
  const snapshot = await next();
  if (snapshot.type !== "snapshot") throw new Error(`first message was ${snapshot.type}`);
  return { ws, next, send, snapshot, idle: () => expect(queue).toEqual([]) };
}

const memo = (id: string, title = "Din Tai Fung") => ({
  id,
  kind: "memo",
  title,
  color: "#fff1b8",
  x: 10,
  y: 20,
  rot: 0,
  scale: 1,
  by: "forged",
  updatedAt: "1999-01-01T00:00:00Z",
  body: "",
  tags: ["Food"],
  mapsUrl: null,
  pin: null,
  schedule: null,
  budget: null,
  checked: false,
  image: null,
});

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

describe("the public booklet", () => {
  const OWNER = "publisher@example.com";
  const GUEST = "reader@example.com";
  const page = (url: string) => server.fetch(url);

  /** A room of OWNER's with GUEST in it, and one confirmed memo with things that stay private */
  async function roomWithPlan(owner = OWNER) {
    const { roomId } = await createRoom(owner);
    await admit(roomId, owner, GUEST);
    const a = await connect(roomId, owner);
    const note = {
      ...memo("n1", "<script>alert(1)</script> Din Tai Fung"),
      body: "Queue & all",
      schedule: { date: TRIP.days[0], time: "12:30", status: "fixed" },
      minutes: 90,
      budget: 4321,
      booking: { state: "booked", code: "SECRET-CODE", url: "https://example.com/private" },
    };
    a.send({ type: "note:add", note, cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");
    return roomId;
  }

  test("the owner publishes the plan as a page with no script, nothing private, escaped", async () => {
    const roomId = await roomWithPlan();
    const before = await post(`/api/rooms/${roomId}/publication`, GUEST);
    expect(await before.json()).toEqual({ publication: null });

    const res = await post(`/api/rooms/${roomId}/publish`, OWNER, { lang: "en" });
    expect(res.status).toBe(200);
    const { publication } = (await res.json()) as { publication: { url: string; at: string } };
    expect(publication.url).toMatch(
      /^https:\/\/shiori\.chirashitabi\.app\/r\/[A-Za-z0-9_-]{22}\/shiori$/,
    );

    // the other person sees it is up, and where
    const seen = await post(`/api/rooms/${roomId}/publication`, GUEST);
    expect(await seen.json()).toEqual({ publication });

    const shown = await page(publication.url);
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(shown.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(shown.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const html = await shown.text();
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Din Tai Fung");
    expect(html).not.toContain("<script");
    expect(html).toContain("Queue &amp; all");
    expect(html).toContain("12:30–14:00");
    for (const secret of ["SECRET-CODE", "example.com/private", "4321", "Yuki", "Ken"])
      expect(html).not.toContain(secret);
  });

  test("only the owner publishes or takes it down; publishing again moves it", async () => {
    const roomId = await roomWithPlan();
    expect((await post(`/api/rooms/${roomId}/publish`, GUEST, { lang: "ja" })).status).toBe(403);
    const first = (await (
      await post(`/api/rooms/${roomId}/publish`, OWNER, { lang: "ja" })
    ).json()) as {
      publication: { url: string };
    };
    const again = (await (
      await post(`/api/rooms/${roomId}/publish`, OWNER, { lang: "ja" })
    ).json()) as {
      publication: { url: string };
    };
    expect(again.publication.url).not.toBe(first.publication.url);
    expect((await page(first.publication.url)).status).toBe(404);
    expect((await page(again.publication.url)).status).toBe(200);

    expect((await post(`/api/rooms/${roomId}/withdraw`, GUEST)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/withdraw`, OWNER)).status).toBe(200);
    expect((await page(again.publication.url)).status).toBe(404);
    const after = await post(`/api/rooms/${roomId}/publication`, GUEST);
    expect(await after.json()).toEqual({ publication: null });
  });

  test("publishing twice at once, or withdrawing meanwhile, leaves up only the file on record", async () => {
    const { roomId, memberId: owner } = await createRoom("racer@example.com");
    const env = await server.getWorker().getEnv();
    // the room's own calls, each on a stub of its own so they run side by side: no budget
    const room = () => env.ROOM.getByName(roomId);
    const publish = async () => {
      const published = (await room().publish(owner, "ja")) as { value: { slug: string } };
      return published.value.slug;
    };
    // taps in a row, then a publish and a withdrawal crossing
    const tapped = await Promise.all([publish(), publish(), publish()]);
    const [crossed] = await Promise.all([publish(), room().withdraw(owner)]);
    const on = await room().publication(owner);
    for (const slug of [...tapped, crossed])
      expect((await env.IMAGES.head(`booklets/${slug}/shiori.html`)) !== null).toBe(
        slug === on?.slug,
      );
  });

  test("deleting the trip takes its booklet down", async () => {
    // an owner of their own: each publish counts against the day's budget
    const DELETER = "deleter@example.com";
    const roomId = await roomWithPlan(DELETER);
    const { publication } = (await (
      await post(`/api/rooms/${roomId}/publish`, DELETER, { lang: "ja" })
    ).json()) as { publication: { url: string } };
    expect((await post(`/api/rooms/${roomId}/delete`, DELETER)).status).toBe(200);
    expect((await page(publication.url)).status).toBe(404);
  });
});

describe("rooms", () => {
  test("create sets the trip up, mints the creator and the agent, and records the membership", async () => {
    const { roomId, memberId } = await createRoom(ME);
    expect(roomId).toMatch(/^[0-9a-f-]{36}$/);

    const worker = server.getWorker();
    const room = await worker.getDurableObjectStorage("Room", { name: roomId });
    expect(await room.exec("SELECT id, kind, creator, name FROM members ORDER BY kind")).toEqual([
      { id: "agent:claude", kind: "agent", creator: 0, name: "Claude" },
      { id: memberId, kind: "person", creator: 1, name: "Yuki" },
    ]);
    expect(await room.exec("SELECT name, currency FROM trip")).toEqual([
      { name: "Taiwan trip", currency: "TWD" },
    ]);
    expect(await room.exec("SELECT date FROM days ORDER BY position")).toEqual(
      TRIP.days.map((date) => ({ date })),
    );

    const index = await worker.getDurableObjectStorage("RoomsIndex", { name: "index" });
    const rows = await index.exec(
      "SELECT email, member_id FROM memberships WHERE room_id = ?",
      roomId,
    );
    expect(rows).toEqual([{ email: ME, member_id: memberId }]);
  });

  test("a person may be nameless: told apart by color alone", async () => {
    const res = await post("/api/rooms", ME, { trip: TRIP, me: { name: "  ", color: "#3c6ee0" } });
    expect(res.status).toBe(200);
    const { roomId, memberId } = (await res.json()) as { roomId: string; memberId: string };
    const room = await server.getWorker().getDurableObjectStorage("Room", { name: roomId });
    expect(await room.exec("SELECT name FROM members WHERE id = ?", memberId)).toEqual([
      { name: "" },
    ]);
  });

  test.each([
    ["no trip", { me: YUKI }],
    ["no profile", { trip: TRIP }],
    ["a currency Intl does not know", { trip: { ...TRIP, currency: "XXX" }, me: YUKI }],
    ["a day that is not a date", { trip: { ...TRIP, days: ["2026-11-31"] }, me: YUKI }],
    ["no days", { trip: { ...TRIP, days: [] }, me: YUKI }],
    ["a color that is not hex", { trip: TRIP, me: { ...YUKI, color: "red" } }],
    ["a name that is not text", { trip: TRIP, me: { ...YUKI, name: 1 } }],
  ])("create refuses %s", async (_, body) => {
    expect((await post("/api/rooms", ME, body)).status).toBe(400);
  });

  test("the e-mail is matched case-insensitively", async () => {
    const { roomId } = await createRoom("Mixed.Case@Example.com");
    expect((await invite(roomId, "mixed.case@example.com", PARTNER)).status).toBe(200);
  });

  test("an unknown room is 404, a room one is not in is 403", async () => {
    const { roomId } = await createRoom(ME);
    expect((await invite("not-a-room-id", ME, PARTNER)).status).toBe(404);
    expect((await invite(crypto.randomUUID(), ME, PARTNER)).status).toBe(403);
    expect((await invite(roomId, STRANGER, PARTNER)).status).toBe(403);
  });

  test("me lists each room at a glance: name, days, members and memo count", async () => {
    const email = "glance@example.com";
    const partner = "glance-partner@example.com";
    const { roomId } = await createRoom(email);
    expect((await admit(roomId, email, partner)).status).toBe(200);
    const a = await connect(roomId, email);
    const b = await connect(roomId, partner);
    a.send({ type: "note:add", note: memo("n1") });
    await b.next();

    const res = await post("/api/me", email, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      // who is asking, so a device can tell whose what it kept is
      email,
      rooms: [
        {
          id: roomId,
          name: "Taiwan trip",
          first: "2026-11-03",
          days: 3,
          members: [
            { kind: "person", name: "Yuki", color: YUKI.color },
            { kind: "person", name: "Ken", color: KEN.color },
            { kind: "agent", name: "Claude", color: expect.any(String) },
          ],
          memos: 1,
          owner: true,
        },
      ],
      invitations: [],
      deleted: [],
    });
    // the partner is in it but did not make it; an invitation is nobody's to delete
    expect((await me(partner)).rooms).toMatchObject([{ id: roomId, owner: false }]);
    const other = await createRoom(partner);
    expect((await invite(other.roomId, partner, email)).status).toBe(200);
    expect((await me(email)).invitations).toMatchObject([{ id: other.roomId, owner: false }]);
  });

  test("an e-mail may hold ten rooms", async () => {
    const email = "collector@example.com";
    for (let i = 0; i < 10; i++) await createRoom(email);
    expect(await refusal(await post("/api/rooms", email, { trip: TRIP, me: YUKI }))).toEqual([
      409,
      { error: "at the cap" },
    ]);
  });
});

/** Whom the owner of a room has invited, as the owner asks */
async function invited(roomId: string, owner: string) {
  const res = await post(`/api/rooms/${roomId}/invited`, owner);
  expect(res.status).toBe(200);
  return ((await res.json()) as { invited: string[] }).invited;
}

/** `/api/me` for `email` */
const me = async (email: string) =>
  (await (await post("/api/me", email)).json()) as {
    rooms: { id: string }[];
    invitations: { id: string; name: string; members: { name: string }[] }[];
    deleted: { id: string; name: string; deletedAt: string }[];
  };

describe("invitations", () => {
  test("the owner invites an e-mail; it waits in that person's list until they answer", async () => {
    const owner = "inv-owner@example.com";
    const guest = "Inv-Guest@Example.com";
    const { roomId } = await createRoom(owner);

    expect(await invite(roomId, owner, guest)).toHaveProperty("status", 200);
    expect(await invited(roomId, owner)).toEqual(["inv-guest@example.com"]);
    const { rooms, invitations } = await me("inv-guest@example.com");
    expect(rooms).toEqual([]);
    expect(invitations).toMatchObject([
      { id: roomId, name: "Taiwan trip", members: [{ name: "Yuki" }, { name: "Claude" }] },
    ]);
    // invited is not in: nothing of the room opens yet
    expect((await post(`/api/rooms/${roomId}/invited`, guest)).status).toBe(403);
  });

  test("accepting makes them a member as they say, tells the sockets, and the seat is theirs", async () => {
    const owner = "acc-owner@example.com";
    const guest = "acc-guest@example.com";
    const { roomId } = await createRoom(owner);
    const a = await connect(roomId, owner);
    expect((await invite(roomId, owner, guest)).status).toBe(200);

    expect((await accept(roomId, guest, { name: "Ken", color: "black" })).status).toBe(400);
    const res = await accept(roomId, guest, KEN);
    expect(res.status).toBe(200);
    const { memberId } = (await res.json()) as { memberId: string };

    expect(await a.next()).toEqual({
      type: "members",
      members: [
        {
          id: a.snapshot.type === "snapshot" ? a.snapshot.me : "",
          kind: "person",
          role: "owner",
          ...YUKI,
        },
        { id: "agent:claude", kind: "agent", name: "Claude", color: "#d97757" },
        { id: memberId, kind: "person", role: "guest", ...KEN },
      ],
    });
    const b = await connect(roomId, guest);
    expect(b.snapshot).toMatchObject({ me: memberId });
    expect((await me(guest)).invitations).toEqual([]);
    expect(await invited(roomId, owner)).toEqual([]);
    // the invitation was used up
    expect((await accept(roomId, guest)).status).toBe(404);
    a.ws.close(1000, "done");
    b.ws.close(1000, "done");
  });

  test("only the owner invites; a room holds two people, an invitation holding a seat", async () => {
    const owner = "seat-owner@example.com";
    const { roomId } = await createRoom(owner);

    expect((await invite(roomId, STRANGER, "x@example.com")).status).toBe(403);
    expect((await invite(roomId, owner, "")).status).toBe(400);
    expect((await invite(roomId, owner, "not an e-mail")).status).toBe(400);
    expect(await refusal(await invite(roomId, owner, owner))).toEqual([
      409,
      { error: "already in" },
    ]);

    expect((await invite(roomId, owner, "seat-a@example.com")).status).toBe(200);
    // already invited, and so holding the last seat: the seat is asked for first
    expect(await refusal(await invite(roomId, owner, "seat-a@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);
    // the seat is held
    expect(await refusal(await invite(roomId, owner, "seat-b@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);

    expect((await accept(roomId, "seat-a@example.com")).status).toBe(200);
    expect(await refusal(await invite(roomId, "seat-a@example.com", "seat-b@example.com"))).toEqual(
      [403, { error: "not the owner" }],
    );
    // full
    expect(await refusal(await invite(roomId, owner, "seat-b@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);
    // the partner does not see whom the owner invites
    expect((await post(`/api/rooms/${roomId}/invited`, "seat-a@example.com")).status).toBe(403);
  });

  test("an invitation's path that names no room is not found", async () => {
    const email = "nopath@example.com";
    expect((await post("/api/invitations/not-a-room/decline", email)).status).toBe(404);
    expect((await accept("not-a-room", email)).status).toBe(404);
  });

  test("declining or withdrawing gives the seat back", async () => {
    const owner = "back-owner@example.com";
    const { roomId } = await createRoom(owner);

    expect((await invite(roomId, owner, "back-a@example.com")).status).toBe(200);
    expect((await post(`/api/invitations/${roomId}/decline`, "back-a@example.com")).status).toBe(
      200,
    );
    expect((await me("back-a@example.com")).invitations).toEqual([]);
    expect((await accept(roomId, "back-a@example.com")).status).toBe(404);

    expect((await invite(roomId, owner, "back-b@example.com")).status).toBe(200);
    const uninvite = (email: string, by = owner) =>
      post(`/api/rooms/${roomId}/uninvite`, by, { email });
    expect((await uninvite("nobody@example.com")).status).toBe(404);
    expect((await uninvite("back-b@example.com")).status).toBe(200);
    expect((await accept(roomId, "back-b@example.com")).status).toBe(404);

    expect((await admit(roomId, owner, "back-c@example.com")).status).toBe(200);
  });

  test("an invitee at their room cap loses the seat instead of going over", async () => {
    const owner = "cap-owner@example.com";
    const busy = "cap-busy@example.com";
    const { roomId } = await createRoom(owner);
    for (let i = 0; i < 10; i++) await createRoom(busy);
    expect((await invite(roomId, owner, busy)).status).toBe(200);
    expect(await refusal(await accept(roomId, busy))).toEqual([409, { error: "at the cap" }]);
    expect(await invited(roomId, owner)).toEqual([]);
    expect((await admit(roomId, owner, "cap-other@example.com")).status).toBe(200);
  });
});

describe("removing and leaving", () => {
  test("the owner removes the partner: their socket is told and closed, the room goes from their list", async () => {
    const owner = "rm-owner@example.com";
    const guest = "rm-guest@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const { memberId: ken } = (await (await admit(roomId, owner, guest)).json()) as {
      memberId: string;
    };
    const a = await connect(roomId, owner);
    const b = await connect(roomId, guest);
    b.send({ type: "note:add", note: memo("kept") });
    await a.next();

    const remove = (by: string, member: string) =>
      post(`/api/rooms/${roomId}/remove`, by, { member });
    // nobody removes the owner
    expect(await refusal(await remove(guest, yuki))).toEqual([403, { error: "the owner" }]);
    expect((await remove(owner, yuki)).status).toBe(403);
    expect((await remove(owner, "agent:claude")).status).toBe(403);
    expect((await remove(owner, "yuki")).status).toBe(400); // not a member id at all
    expect((await remove(owner, ken)).status).toBe(200);

    expect(await b.next()).toEqual({ type: "gone", reason: "removed" });
    expect(await a.next()).toMatchObject({
      type: "members",
      members: [{ id: yuki }, { id: "agent:claude" }],
    });
    expect((await post("/api/me", guest)).status).toBe(200);
    expect((await me(guest)).rooms).toEqual([]);
    expect((await post(`/api/rooms/${roomId}/invited`, guest)).status).toBe(403);
    // what they wrote stays, in their name
    const c = await connect(roomId, owner);
    expect(c.snapshot).toMatchObject({ notes: [{ id: "kept", by: ken }] });
    // and the seat is free again
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    a.ws.close(1000, "done");
    c.ws.close(1000, "done");
  });

  test("the partner may leave; the owner may not", async () => {
    const owner = "lv-owner@example.com";
    const guest = "lv-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    const b = await connect(roomId, guest);
    expect(await refusal(await post(`/api/rooms/${roomId}/leave`, owner))).toEqual([
      403,
      { error: "the owner" },
    ]);
    expect((await post(`/api/rooms/${roomId}/leave`, guest)).status).toBe(200);
    expect(await b.next()).toEqual({ type: "gone", reason: "left" });
    expect((await me(guest)).rooms).toEqual([]);
    expect((await post(`/api/rooms/${roomId}/leave`, guest)).status).toBe(403);
  });
});

describe("deleting a room", () => {
  test("only the owner deletes; every socket is told, nobody can open it, either person can restore it", async () => {
    const owner = "del-owner@example.com";
    const guest = "del-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, guest);

    expect((await post(`/api/rooms/${roomId}/delete`, guest)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    expect(await a.next()).toEqual({ type: "gone", reason: "deleted" });
    expect(await b.next()).toEqual({ type: "gone", reason: "deleted" });

    const listed = me;
    for (const email of [owner, guest])
      expect(await listed(email)).toMatchObject({
        rooms: [],
        deleted: [{ id: roomId, name: "Taiwan trip", deletedAt: expect.any(String) }],
      });
    expect((await listed(STRANGER)).deleted).toEqual([]);
    expect((await post(`/api/rooms/${roomId}/invited`, owner)).status).toBe(403);
    const ws = await server.fetch(`${APP}/api/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket", Origin: APP, "Cf-Access-Jwt-Assertion": await token(owner) },
    });
    expect(ws.status).toBe(403);

    expect((await post(`/api/rooms/${roomId}/restore`, STRANGER)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/restore`, guest)).status).toBe(200);
    expect((await listed(owner)).rooms).toMatchObject([{ id: roomId }]);
    expect((await post(`/api/rooms/${roomId}/restore`, owner)).status).toBe(403); // not deleted
    const c = await connect(roomId, owner);
    c.ws.close(1000, "done");
  });

  test("the owner, and only the owner, has a deleted room gone for good at once", async () => {
    const owner = "purge-owner@example.com";
    const guest = "purge-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    expect((await post(`/api/rooms/${roomId}/purge`, owner)).status).toBe(403); // not deleted
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);

    expect((await post(`/api/rooms/${roomId}/purge`, STRANGER)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/purge`, guest)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/purge`, owner)).status).toBe(200);

    for (const email of [owner, guest])
      expect(await me(email)).toMatchObject({ rooms: [], deleted: [] });
    expect((await post(`/api/rooms/${roomId}/restore`, guest)).status).toBe(403);
    const worker = server.getWorker();
    const room = await worker.getDurableObjectStorage("Room", { name: roomId });
    expect(
      await room.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trip'"),
    ).toEqual([]);
    const index = await worker.getDurableObjectStorage("RoomsIndex", { name: "index" });
    expect(await index.exec("SELECT * FROM memberships WHERE room_id = ?", roomId)).toEqual([]);
  });

  test("deleting right after a removal passes over the socket still closing; asked again, it finishes", async () => {
    const owner = "delrm-owner@example.com";
    const guest = "delrm-guest@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const { memberId: ken } = (await (await admit(roomId, owner, guest)).json()) as {
      memberId: string;
    };
    const b = await connect(roomId, guest);
    const stub = (await server.getWorker().getEnv()).ROOM.getByName(roomId);
    // one after the other, before the removed phone has answered the close
    await Promise.all([stub.remove(yuki, ken), stub.delete(yuki, roomId)]);
    expect(await b.next()).toEqual({ type: "gone", reason: "removed" });
    const at = await stub.deletedAt();
    expect(at).not.toBeNull();

    // the index was never told (the Worker's call would have been the one to): the owner asks
    // again, and the deletion keeps its time
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    expect(await me(owner)).toMatchObject({ rooms: [], deleted: [{ id: roomId, deletedAt: at }] });
  });

  test("a deleted room takes its invitations with it", async () => {
    const owner = "deli-owner@example.com";
    const { roomId } = await createRoom(owner);
    expect((await invite(roomId, owner, "deli-guest@example.com")).status).toBe(200);
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    expect((await me("deli-guest@example.com")).invitations).toEqual([]);
    expect((await accept(roomId, "deli-guest@example.com")).status).toBe(404);
  });

  test("on its day the room, its pictures and its memberships go for good", async () => {
    const owner = "gone-owner@example.com";
    const { roomId } = await createRoom(owner);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const up = await server.fetch(`${APP}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        Origin: APP,
        "Cf-Access-Jwt-Assertion": await token(owner),
      },
      body: png,
    });
    expect(up.status).toBe(200);
    const { id: imageId } = (await up.json()) as { id: string };
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);

    const worker = server.getWorker();
    const room = await worker.getDurableObjectStorage("Room", { name: roomId });
    const env = await worker.getEnv();
    const stub = env.ROOM.getByName(roomId);
    // before its day the alarm leaves everything
    await stub.sweep();
    expect(await env.IMAGES.head(`rooms/${roomId}/images/${imageId}`)).not.toBeNull();

    // the day comes early
    await room.exec("UPDATE deletion SET at = '2000-01-01T00:00:00.000Z'");
    await stub.sweep();
    expect(
      await room.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trip'"),
    ).toEqual([]);
    const index = await worker.getDurableObjectStorage("RoomsIndex", { name: "index" });
    expect(await index.exec("SELECT * FROM memberships WHERE room_id = ?", roomId)).toEqual([]);
    expect(await env.IMAGES.head(`rooms/${roomId}/images/${imageId}`)).toBeNull();
  });
});

describe("the socket", () => {
  test("a member connects and gets the snapshot: who they are, who is here, the trip, no notes", async () => {
    const { roomId, memberId } = await createRoom(ME);
    const { snapshot, ws } = await connect(roomId, ME);
    expect(snapshot).toEqual({
      type: "snapshot",
      me: memberId,
      members: [
        { id: memberId, kind: "person", role: "owner", name: "Yuki", color: "#3c6ee0" },
        { id: "agent:claude", kind: "agent", name: "Claude", color: "#d97757" },
      ],
      trip: {
        ...TRIP,
        days: TRIP.days.map((date) => ({ date, intro: "" })),
        flights: { out: null, back: null },
        stays: [],
      },
      notes: [],
    });
    ws.close(1000, "done");
  });

  test("not a member: no socket", async () => {
    const { roomId } = await createRoom(ME);
    const res = await server.fetch(`${APP}/api/rooms/${roomId}/ws`, {
      headers: {
        Upgrade: "websocket",
        Origin: APP,
        "Cf-Access-Jwt-Assertion": await token(STRANGER),
      },
    });
    expect(res.status).toBe(403);
  });

  test("the upgrade needs the Origin too", async () => {
    const { roomId } = await createRoom(ME);
    const res = await server.fetch(`${APP}/api/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket", "Cf-Access-Jwt-Assertion": await token(ME) },
    });
    expect(res.status).toBe(403);
  });

  test("a note one member adds reaches the other, stamped by the room, and is in the next snapshot", async () => {
    const { roomId, memberId: yuki } = await createRoom(ME);
    const { memberId: ken } = (await (await admit(roomId, ME, PARTNER)).json()) as {
      memberId: string;
    };
    const a = await connect(roomId, ME);
    const b = await connect(roomId, PARTNER);
    expect(b.snapshot.me).toBe(ken);

    a.send({ type: "note:add", note: memo("n1") });
    const got = await b.next();
    expect(got.type).toBe("mutation");
    if (got.type !== "mutation") return;
    expect(got.by).toBe(yuki);
    expect(got.mutation.type).toBe("note:add");
    if (got.mutation.type !== "note:add") return;
    expect(got.mutation.note.by).toBe(yuki); // not "forged"
    expect(got.mutation.note.updatedAt).toBe(got.updatedAt);
    expect(Date.parse(got.updatedAt)).toBeGreaterThan(Date.parse("2026-01-01"));
    a.idle(); // the sender applied it locally and hears nothing back

    const c = await connect(roomId, PARTNER);
    // a memo from a client that does not say how long it takes takes no time it was not given
    expect(c.snapshot.notes).toEqual([
      {
        ...memo("n1"),
        minutes: null,
        hours: null,
        link: null,
        booking: null,
        due: null,
        assignee: null,
        by: yuki,
        updatedAt: got.updatedAt,
      },
    ]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a text box is written on the desk, rewritten, resized and taken away", async () => {
    const owner = "text-owner@example.com";
    const partner = "text-partner@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, partner)).status).toBe(200);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);
    const box = {
      id: "t1",
      kind: "text",
      title: "Day 1",
      color: "#ffffff",
      x: 5,
      y: 6,
      rot: 0,
      scale: 1,
    };

    a.send({ type: "note:add", note: box, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    expect(await b.next()).toMatchObject({
      mutation: { type: "note:add", note: { kind: "text" } },
    });
    a.send({ type: "text:edit", id: "t1", text: "Day 1 · Taipei" });
    await b.next();
    a.send({ type: "note:move", id: "t1", x: 50, y: 60, scale: 2, cid: "c1b" });
    await a.next();
    await b.next();
    a.send({ type: "text:edit", id: "t1", text: "x".repeat(1001), cid: "c2" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation" });
    a.send({ type: "note:add", note: memo("m1"), cid: "c3" });
    await a.next();
    await b.next();
    a.send({ type: "text:edit", id: "m1", text: "x", cid: "c4" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a text box" });

    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({
      notes: [
        { id: "t1", kind: "text", title: "Day 1 · Taipei", x: 50, y: 60, scale: 2 },
        { id: "m1" },
      ],
    });
    a.send({ type: "note:delete", id: "t1" });
    await b.next();
    const d = await connect(roomId, partner);
    expect(d.snapshot).toMatchObject({ notes: [{ id: "m1" }] });
    // the room's list counts memos, not words on the desk
    expect((await me(owner)).rooms).toMatchObject([{ memos: 1 }]);
    for (const s of [a, b, c, d]) s.ws.close(1000, "done");
  });

  test("a room from before stickers takes them once its notes are copied over", async () => {
    const owner = "old-sticker-room@example.com";
    const { roomId } = await createRoom(owner);
    const worker = server.getWorker();
    const room = await worker.getDurableObjectStorage("Room", { name: roomId });
    // the notes table as it was: a CHECK without 'sticker', with a text box in it
    await room.exec("DROP TABLE notes");
    await room.exec(`CREATE TABLE notes (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('memo', 'suggestion', 'text')),
      title TEXT NOT NULL, color TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, rot REAL NOT NULL,
      by TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]', maps_url TEXT, pin_lat REAL, pin_lng REAL, sched_date TEXT,
      sched_time TEXT, sched_status TEXT, budget REAL, deleted_at TEXT,
      checked INTEGER NOT NULL DEFAULT 0, image TEXT, scale REAL NOT NULL DEFAULT 1)`);
    await room.exec(
      `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at)
       VALUES ('old', 'text', 'Kept', '#ffffff', 1, 2, 3, 'someone', '2026-01-01T00:00:00Z')`,
    );
    await worker.evictDurableObject("Room", { name: roomId });

    const a = await connect(roomId, owner);
    expect(a.snapshot).toMatchObject({ notes: [{ id: "old", kind: "text", title: "Kept" }] });
    a.ws.close(1000, "done");
  });

  test("a room from before null times keeps its flights, an unknown time now null", async () => {
    const owner = "old-flight-room@example.com";
    const { roomId } = await createRoom(owner);
    const worker = server.getWorker();
    const room = await worker.getDurableObjectStorage("Room", { name: roomId });
    // the flights table as it was: times NOT NULL, one not known yet written ""
    await room.exec("DROP TABLE flights");
    await room.exec(`CREATE TABLE flights (
      leg TEXT PRIMARY KEY CHECK (leg IN ('out', 'back')), number TEXT NOT NULL,
      from_place TEXT NOT NULL, to_place TEXT NOT NULL, departs TEXT NOT NULL, arrives TEXT NOT NULL)`);
    await room.exec(
      `INSERT INTO flights (leg, number, from_place, to_place, departs, arrives)
       VALUES ('out', 'BR 191', 'HND', 'TSA', '2026-11-03T08:50', '')`,
    );
    await worker.evictDurableObject("Room", { name: roomId });

    const a = await connect(roomId, owner);
    expect(a.snapshot).toMatchObject({
      trip: {
        flights: {
          out: { number: "BR 191", departs: "2026-11-03T08:50", arrives: null },
          back: null,
        },
      },
    });
    a.ws.close(1000, "done");
  });

  test("a room from before text boxes takes them once its notes are copied over", async () => {
    const owner = "old-room@example.com";
    const { roomId } = await createRoom(owner);
    const worker = server.getWorker();
    const room = await worker.getDurableObjectStorage("Room", { name: roomId });
    // the notes table as it was: a CHECK without 'text', with a memo in it
    await room.exec("DROP TABLE notes");
    await room.exec(`CREATE TABLE notes (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('memo', 'suggestion')),
      title TEXT NOT NULL, color TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, rot REAL NOT NULL,
      by TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]', maps_url TEXT, pin_lat REAL, pin_lng REAL, sched_date TEXT,
      sched_time TEXT, sched_status TEXT, budget REAL, deleted_at TEXT,
      checked INTEGER NOT NULL DEFAULT 0, image TEXT, scale REAL NOT NULL DEFAULT 1)`);
    await room.exec(
      `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at, tags, checked)
       VALUES ('old', 'memo', 'Kept', '#fff1b8', 1, 2, 3, 'someone', '2026-01-01T00:00:00Z', '["Food"]', 1)`,
    );
    await worker.evictDurableObject("Room", { name: roomId });

    const a = await connect(roomId, owner);
    expect(a.snapshot).toMatchObject({
      notes: [
        {
          id: "old",
          title: "Kept",
          tags: ["Food"],
          checked: true,
          rot: 3,
          minutes: null,
          hours: null,
          link: null,
          booking: null,
          due: null,
          assignee: null,
        },
      ],
    });
    const box = {
      id: "t2",
      kind: "text",
      title: "Hi",
      color: "#ffffff",
      x: 0,
      y: 0,
      rot: 0,
      scale: 1,
    };
    a.send({ type: "note:add", note: box, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.ws.close(1000, "done");
  });

  test("how long a memo takes is kept, changed and taken back; past a day it is refused", async () => {
    const LONG = "minutes@example.com";
    const { roomId } = await createRoom(LONG);
    const a = await connect(roomId, LONG);
    a.send({ type: "note:add", note: { ...memo("n1"), minutes: 90 }, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.send({ type: "note:update", id: "n1", patch: { minutes: 1441 }, cid: "c2" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c2" });
    a.send({ type: "note:update", id: "n1", patch: { body: "lunch" }, cid: "c3" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c3" });
    const b = await connect(roomId, LONG);
    // a patch that does not name it keeps it
    expect(b.snapshot.notes).toMatchObject([{ id: "n1", minutes: 90, body: "lunch" }]);
    a.send({ type: "note:update", id: "n1", patch: { minutes: null }, cid: "c4" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c4" });
    const c = await connect(roomId, LONG);
    expect(c.snapshot.notes).toMatchObject([{ id: "n1", minutes: null }]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("when a memo's place is open is kept as written, trimmed; blank is refused", async () => {
    const OPEN = "hours@example.com";
    const { roomId } = await createRoom(OPEN);
    const a = await connect(roomId, OPEN);
    a.send({ type: "note:add", note: { ...memo("n1"), hours: " Mo-Fr 10:00-20:00 " }, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.send({ type: "note:update", id: "n1", patch: { hours: "  " }, cid: "c2" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c2" });
    const b = await connect(roomId, OPEN);
    expect(b.snapshot.notes).toMatchObject([{ id: "n1", hours: "Mo-Fr 10:00-20:00" }]);
    a.send({ type: "note:update", id: "n1", patch: { hours: null }, cid: "c3" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c3" });
    const c = await connect(roomId, OPEN);
    expect(c.snapshot.notes).toMatchObject([{ id: "n1", hours: null }]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a booking is kept as its state says: by when while to book, its number and page once booked", async () => {
    const BOOK = "booking@example.com";
    const { roomId } = await createRoom(BOOK);
    const a = await connect(roomId, BOOK);
    const needed = { state: "needed", by: "2026-10-20" };
    a.send({ type: "note:add", note: { ...memo("n1"), booking: needed }, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    const b = await connect(roomId, BOOK);
    expect(b.snapshot.notes).toMatchObject([{ id: "n1", booking: needed }]);
    // a booked one has no day to book by; a state it does not know is refused
    const booked = { state: "booked", code: " ABC123 ", url: "https://example.com/r/1" };
    a.send({ type: "note:update", id: "n1", patch: { booking: booked }, cid: "c2" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c2" });
    const odd = { state: "maybe", by: null };
    a.send({ type: "note:update", id: "n1", patch: { booking: odd }, cid: "c3" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c3" });
    const c = await connect(roomId, BOOK);
    expect(c.snapshot.notes).toMatchObject([
      { id: "n1", booking: { state: "booked", code: "ABC123", url: "https://example.com/r/1" } },
    ]);
    a.send({ type: "note:update", id: "n1", patch: { booking: null }, cid: "c4" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c4" });
    const d = await connect(roomId, BOOK);
    expect(d.snapshot.notes).toMatchObject([{ id: "n1", booking: null }]);
    for (const s of [a, b, c, d]) s.ws.close(1000, "done");
  });

  test("a to-do keeps the day it is due by and who is to do it", async () => {
    const TODO = "todo@example.com";
    const { roomId, memberId } = await createRoom(TODO);
    const a = await connect(roomId, TODO);
    const todo = {
      ...memo("n1", "Change money"),
      tags: ["To do"],
      due: "2026-10-30",
      assignee: memberId,
    };
    a.send({ type: "note:add", note: todo, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.send({ type: "note:update", id: "n1", patch: { due: "2026-02-30" }, cid: "c2" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c2" });
    const b = await connect(roomId, TODO);
    expect(b.snapshot.notes).toMatchObject([{ id: "n1", due: "2026-10-30", assignee: memberId }]);
    a.send({ type: "note:update", id: "n1", patch: { due: null, assignee: null }, cid: "c3" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c3" });
    const c = await connect(roomId, TODO);
    expect(c.snapshot.notes).toMatchObject([{ id: "n1", due: null, assignee: null }]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("updates, moves, recolors, adoption, deletion and the day intro all land", async () => {
    const { roomId, memberId: yuki } = await createRoom(ME);
    await admit(roomId, ME, PARTNER);
    const a = await connect(roomId, ME);
    const b = await connect(roomId, PARTNER);
    const after = async (m: Record<string, unknown>) => {
      a.send(m);
      const got = await b.next();
      if (got.type !== "mutation") throw new Error(got.type);
      return got.mutation;
    };

    await after({ type: "note:add", note: memo("n1") });
    await after({
      type: "note:add",
      note: { ...memo("s1", "Try the night market"), kind: "suggestion" },
    });
    expect(
      await after({ type: "note:update", id: "n1", patch: { body: "lunch", budget: 600 } }),
    ).toEqual({
      type: "note:update",
      id: "n1",
      patch: { body: "lunch", budget: 600 },
    });
    await after({ type: "note:move", id: "n1", x: 300, y: 400 });
    await after({ type: "note:recolor", id: "n1", color: "#dbe7ff" });
    await after({ type: "note:adopt", id: "s1" });
    await after({ type: "day:intro", date: "2026-11-04", intro: "Jiufen day" });
    await after({ type: "member:profile", name: "Yuki K", color: "#112233" });
    await after({ type: "note:delete", id: "n1" });

    const c = await connect(roomId, ME);
    expect(c.snapshot.notes).toEqual([
      {
        id: "s1",
        kind: "memo",
        title: "Try the night market",
        color: "#ffffff",
        x: 10,
        y: 20,
        rot: 0,
        scale: 1,
        by: yuki,
        updatedAt: expect.any(String),
        body: "",
        tags: [],
        mapsUrl: null,
        pin: null,
        schedule: null,
        budget: null,
        checked: false,
        image: null,
        minutes: null,
        hours: null,
        link: null,
        booking: null,
        due: null,
        assignee: null,
      },
    ]);
    expect(c.snapshot.trip.days[1]).toEqual({ date: "2026-11-04", intro: "Jiufen day" });
    expect(c.snapshot.members[0]).toEqual({
      id: yuki,
      kind: "person",
      role: "owner",
      name: "Yuki K",
      color: "#112233",
    });
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a tick in the appendix reaches the other member and stays; an older client's note is unticked", async () => {
    const { roomId } = await createRoom(ME);
    await admit(roomId, ME, PARTNER);
    const a = await connect(roomId, ME);
    const b = await connect(roomId, PARTNER);
    const { checked: _, ...older } = { ...memo("p1", "Passport"), tags: ["Packing"] };
    a.send({ type: "note:add", note: older });
    await b.next();
    a.send({ type: "note:update", id: "p1", patch: { checked: true } });
    const got = await b.next();
    expect(got.type === "mutation" && got.mutation).toEqual({
      type: "note:update",
      id: "p1",
      patch: { checked: true },
    });
    const c = await connect(roomId, PARTNER);
    expect(c.snapshot.notes.map((n) => n.kind === "memo" && n.checked)).toEqual([true]);
    a.send({ type: "note:update", id: "p1", patch: { checked: "yes" } });
    const refused = await a.next();
    expect(refused).toEqual({ type: "rejected", reason: "not a mutation" });
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("new dates move the days' intros and what is planned; a plan past the new end loses its day", async () => {
    const owner = "dates-owner@example.com";
    const { roomId } = await createRoom(owner); // 11/3, 11/4, 11/5
    const a = await connect(roomId, owner);
    a.send({ type: "day:intro", date: "2026-11-04", intro: "Jiufen", cid: "i" });
    await a.next();
    const on = (date: string) => ({
      ...memo(`m${date}`),
      schedule: { date, time: null, status: "fixed" },
    });
    for (const date of ["2026-11-03", "2026-11-05"]) {
      a.send({ type: "note:add", note: on(date), cid: date });
      await a.next();
    }
    // a week later, two days long: day 2 keeps its intro, 11/3 moves to 11/10, 11/5 falls off
    a.send({ type: "trip:dates", first: "2026-11-10", days: 2, cid: "d" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "d" });
    for (const bad of [
      { first: "2026-02-30", days: 2 },
      { first: "2026-11-10", days: 0 },
      { first: "2026-11-10", days: 61 },
    ]) {
      a.send({ type: "trip:dates", ...bad });
      expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation" });
    }
    // a trip running past 9999-12-31 has days no date can be written for, and nothing moves
    a.send({ type: "trip:dates", first: "9999-12-01", days: 60, cid: "far" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "no such day", cid: "far" });

    const b = await connect(roomId, owner);
    expect(b.snapshot).toMatchObject({
      trip: {
        days: [
          { date: "2026-11-10", intro: "" },
          { date: "2026-11-11", intro: "Jiufen" },
        ],
      },
      notes: [
        { id: "m2026-11-03", schedule: { date: "2026-11-10", status: "fixed" } },
        { id: "m2026-11-05", schedule: null },
      ],
    });
    expect((await me(owner)).rooms).toMatchObject([{ first: "2026-11-10", days: 2 }]);
    for (const s of [a, b]) s.ws.close(1000, "done");
  });

  test("the stays are saved as a list, checked, and kept in order", async () => {
    const owner = "stay-owner@example.com";
    const partner = "stay-partner@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, partner)).status).toBe(200);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);
    const stay = {
      name: " Hotel Proverbs ",
      checkIn: "2026-11-03",
      nights: 2,
      mapsUrl: "https://maps.google.com/?q=25.04,121.55",
      pin: { lat: 25.04, lng: 121.55 },
    };
    const second = {
      name: "Jiufen inn",
      checkIn: "2026-11-05",
      nights: 1,
      mapsUrl: null,
      pin: null,
    };

    a.send({ type: "trip:stays", stays: [stay, second], cid: "s" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "s" });
    expect(await b.next()).toMatchObject({
      mutation: { type: "trip:stays", stays: [{ name: "Hotel Proverbs" }, { name: "Jiufen inn" }] },
    });
    for (const bad of [
      [{ ...stay, name: " " }],
      [{ ...stay, checkIn: "11/3" }],
      [{ ...stay, nights: 0 }],
      [{ ...stay, nights: 1.5 }],
      [{ ...stay, mapsUrl: "javascript:alert(1)" }],
      [{ ...stay, pin: { lat: 91, lng: 0 } }],
      Array.from({ length: 61 }, () => second),
    ]) {
      a.send({ type: "trip:stays", stays: bad });
      expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation" });
    }

    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({
      trip: {
        stays: [
          {
            name: "Hotel Proverbs",
            checkIn: "2026-11-03",
            nights: 2,
            mapsUrl: stay.mapsUrl,
            pin: stay.pin,
          },
          second,
        ],
      },
    });
    a.send({ type: "trip:stays", stays: [] });
    await b.next();
    const d = await connect(roomId, owner);
    expect(d.snapshot).toMatchObject({ trip: { stays: [] } });
    for (const s of [a, b, c, d]) s.ws.close(1000, "done");
  });

  test("a flight is set from its ticket, changed, and taken away", async () => {
    const owner = "flight-owner@example.com";
    const partner = "flight-partner@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, partner)).status).toBe(200);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);
    const flight = {
      number: " BR 191 ",
      from: "HND",
      to: "TSA",
      departs: "2026-11-03T08:50:00",
      arrives: "2026-11-03T11:30",
    };

    a.send({ type: "trip:flight", leg: "out", flight, cid: "f" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "f" });
    expect(await b.next()).toMatchObject({
      mutation: {
        type: "trip:flight",
        leg: "out",
        flight: { number: "BR 191", departs: "2026-11-03T08:50" },
      },
    });
    a.send({
      type: "trip:flight",
      leg: "back",
      flight: { ...flight, from: "TSA", to: "HND", departs: "2026-11-05T17:00" },
    });
    await b.next();
    for (const bad of [
      { leg: "sideways", flight },
      { leg: "out", flight: { ...flight, from: " " } },
      // an airport is a code on the list, exactly: not a name, not another case, not made up
      { leg: "out", flight: { ...flight, from: "羽田" } },
      { leg: "out", flight: { ...flight, from: "hnd" } },
      { leg: "out", flight: { ...flight, to: "ZZZ" } },
      { leg: "out", flight: { ...flight, departs: "11/3 8:50" } },
      { leg: "out", flight: { ...flight, number: "x".repeat(21) } },
    ]) {
      a.send({ type: "trip:flight", ...bad });
      expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation" });
    }
    a.send({ type: "trip:flight", leg: "out", flight: null });
    await b.next();

    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({
      trip: {
        flights: {
          out: null,
          back: {
            number: "BR 191",
            from: "TSA",
            to: "HND",
            departs: "2026-11-05T17:00",
            arrives: "2026-11-03T11:30",
          },
        },
      },
    });

    // only the airports are needed: the number and the times may wait for the ticket
    a.send({
      type: "trip:flight",
      leg: "out",
      flight: { number: "", from: "HND", to: "TSA", departs: null, arrives: null },
      cid: "bare",
    });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "bare" });
    await b.next();
    const d = await connect(roomId, partner);
    expect(d.snapshot).toMatchObject({
      trip: {
        flights: { out: { number: "", from: "HND", to: "TSA", departs: null, arrives: null } },
      },
    });
    for (const s of [a, b, c, d]) s.ws.close(1000, "done");
  });

  test("the trip's name, written on the desk, reaches the other member and the list of trips", async () => {
    const owner = "rename-owner@example.com";
    const partner = "rename-partner@example.com";
    const { roomId } = await createRoom(owner);
    await admit(roomId, owner, partner);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);

    a.send({ type: "trip:rename", name: "  台湾の秋  ", cid: "r1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "r1" });
    expect(await b.next()).toMatchObject({
      type: "mutation",
      mutation: { type: "trip:rename", name: "台湾の秋" },
    });
    for (const name of ["   ", "x".repeat(61)]) {
      a.send({ type: "trip:rename", name });
      expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation" });
    }
    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({ trip: { name: "台湾の秋" } });
    const list = (await (await post("/api/me", partner)).json()) as { rooms: { name: string }[] };
    expect(list.rooms.map((r) => r.name)).toEqual(["台湾の秋"]);
    b.idle();
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("what the room refuses, with the reason, and nobody else hears", async () => {
    const { roomId } = await createRoom(ME);
    await admit(roomId, ME, PARTNER);
    const a = await connect(roomId, ME);
    const b = await connect(roomId, PARTNER);
    const refused = async (m: unknown) => {
      a.send(m);
      const got = await a.next();
      if (got.type !== "rejected") throw new Error(got.type);
      return got.reason;
    };

    expect(await refused("not json")).toBe("not JSON");
    expect(await refused({ type: "note:eat", id: "n1" })).toBe("not a mutation");
    expect(await refused({ type: "note:add", note: { ...memo("n1"), color: "red" } })).toBe(
      "not a mutation",
    );
    expect(await refused({ type: "note:update", id: "n1", patch: { by: "me" } })).toBe(
      "not a mutation",
    );
    expect(await refused({ type: "note:update", id: "nope", patch: { body: "x" } })).toBe(
      "no such note",
    );
    expect(await refused({ type: "day:intro", date: "2026-12-25", intro: "x" })).toBe(
      "no such day",
    );
    expect(await refused({ type: "note:add", note: memo("big", "x".repeat(40_000)) })).toBe(
      "too large",
    );
    // the limit is in bytes: 20,000 characters of three bytes each are 60 KB
    expect(await refused("あ".repeat(20_000))).toBe("too large");
    b.idle();
    for (const s of [a, b]) s.ws.close(1000, "done");
  });

  test("a mutation with a cid is answered to its sender: ack with the room's time, or rejected with the cid", async () => {
    // its own people: the others above have used up what one e-mail may hold
    const owner = "acks@example.com";
    const partner = "acks-partner@example.com";
    const { roomId } = await createRoom(owner);
    await admit(roomId, owner, partner);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);

    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    const ack = await a.next();
    const relayed = await b.next();
    expect(ack).toEqual({ type: "ack", cid: "c1", updatedAt: expect.any(String) });
    // the partner hears the mutation as before, without the cid, at the same time
    expect(relayed.type === "mutation" && relayed.updatedAt).toBe(
      ack.type === "ack" && ack.updatedAt,
    );
    expect(relayed.type === "mutation" && "cid" in relayed.mutation).toBe(false);

    a.send({ type: "note:add", note: memo("n1"), cid: "c2" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "duplicate id", cid: "c2" });
    a.send({ type: "note:eat", cid: "c3" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c3" });
    // a cid that is not an id is ignored, and the answer is the old unnamed one
    a.send({ type: "note:eat", cid: "no spaces allowed" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation" });

    a.send({ type: "note:move", id: "n1", x: 1, y: 2 }); // no cid: relayed, not answered
    expect((await b.next()).type).toBe("mutation");
    a.idle();
    b.idle();
    for (const s of [a, b]) s.ws.close(1000, "done");

    // nor kept: whoever opens the room next finds the card where it was before the drag
    const c = await connect(roomId, partner);
    expect(c.snapshot.type === "snapshot" && c.snapshot.notes).toMatchObject([
      { id: "n1", x: 10, y: 20 },
    ]);
    c.ws.close(1000, "done");
  });

  test("a deleted note keeps its id: adding it again is answered as a duplicate", async () => {
    const email = "readd@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:delete", id: "n1", cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:add", note: memo("n1"), cid: "c3" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "duplicate id", cid: "c3" });
    a.ws.close(1000, "done");
  });

  test("a change sent again after its ack was lost is acked as before, and not written over what came since", async () => {
    const owner = "replay@example.com";
    const partner = "replay-partner@example.com";
    const { roomId } = await createRoom(owner);
    await admit(roomId, owner, partner);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);
    a.send({ type: "note:add", note: memo("n1"), cid: "add" });
    const added = await a.next();
    await b.next();
    a.send({ type: "note:update", id: "n1", patch: { title: "Mine" }, cid: "mine" });
    const updated = await a.next();
    await b.next();
    b.send({ type: "note:update", id: "n1", patch: { title: "Theirs" }, cid: "theirs" });
    await b.next();
    await a.next();

    // the phone comes back and sends again what it never heard answered
    a.ws.close(1000, "lost");
    const again = await connect(roomId, owner);
    again.send({ type: "note:add", note: memo("n1"), cid: "add" });
    expect(await again.next()).toEqual(added);
    again.send({ type: "note:update", id: "n1", patch: { title: "Mine" }, cid: "mine" });
    expect(await again.next()).toEqual(updated);
    // the partner hears nothing of either: the next thing they hear is a new change
    again.send({ type: "note:recolor", id: "n1", color: "#ffffff", cid: "new" });
    expect(await b.next()).toMatchObject({ type: "mutation", mutation: { type: "note:recolor" } });
    // a cid is the sender's own: the partner's same one is a change of its own
    b.send({ type: "note:add", note: memo("n2"), cid: "add" });
    expect(await b.next()).toMatchObject({ type: "ack", cid: "add" });

    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({ notes: [{ id: "n1", title: "Theirs" }, { id: "n2" }] });
    for (const s of [again, b, c]) s.ws.close(1000, "done");
  });

  test("a long drag does not crowd out the change that ends it", async () => {
    const email = "long-drag@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    // as many moves under the finger as a window takes, then letting go
    for (let i = 0; i < 200; i++) a.send({ type: "note:move", id: "n1", x: i, y: i });
    a.send({ type: "note:move", id: "n1", x: 5, y: 5, cid: "let-go" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "let-go" });
    a.ws.close(1000, "done");
  });
});

describe("the agent's draft of a day", () => {
  const DAY = TRIP.days[0]!;
  const onDay = (id: string, title: string) => ({
    ...memo(id, title),
    schedule: { date: DAY, time: null, status: "idea" },
  });
  /** Claude's tool call, as the API answers it */
  const proposing = (input: unknown) => ({
    status: 200,
    body: {
      content: [{ type: "tool_use", id: "t1", name: "propose_day", input }],
      usage: { input_tokens: 120, output_tokens: 40 },
    },
  });

  /** A room of `email`'s with two memos on the first day */
  async function roomWithDay(email: string) {
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: onDay("lunch", "Din Tai Fung"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:add", note: onDay("night", "Raohe night market"), cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");
    return roomId;
  }
  const draft = (roomId: string, email: string, date = DAY) =>
    post(`/api/rooms/${roomId}/draft`, email, { date });

  test("Claude orders the day's notes; the draft is the agent's, and the call is on the ledger", async () => {
    const roomId = await roomWithDay("drafter@example.com");
    answer = () =>
      proposing({
        reason: "Lunch first, the market after dark.",
        intro: "Dumplings, then the night market.",
        items: [
          { id: "lunch", time: "12:30", minutes: 60 },
          { id: "night", time: "19:00", minutes: 1.5 },
          { id: "not-on-this-day", time: "09:00", minutes: 30 },
          { id: "lunch", time: "13:00", minutes: 45 },
        ],
      });
    const before = asked.length;
    const res = await draft(roomId, "drafter@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      by: "agent:claude",
      reason: "Lunch first, the market after dark.",
      intro: "Dumplings, then the night market.",
      // minutes that are not whole are none
      items: [
        { id: "lunch", time: "12:30", minutes: 60 },
        { id: "night", time: "19:00", minutes: null },
      ],
    });
    expect(asked.length).toBe(before + 1);
    // the prompt carries the day's notes and nothing of other days
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).toContain("Raohe night market");

    const room = await server.getWorker().getDurableObjectStorage("Room", { name: roomId });
    expect(await room.exec("SELECT what, input_tokens, output_tokens FROM agent_calls")).toEqual([
      { what: "draft", input_tokens: 120, output_tokens: 40 },
    ]);
  });

  test("a day the trip does not have, or no date, is refused before anything is called", async () => {
    const roomId = await roomWithDay("nodate@example.com");
    const before = asked.length;
    expect((await draft(roomId, "nodate@example.com", "2030-01-01")).status).toBe(400);
    expect((await post(`/api/rooms/${roomId}/draft`, "nodate@example.com", {})).status).toBe(400);
    expect(asked.length).toBe(before);
  });

  test("someone outside the room cannot ask, and nothing is called", async () => {
    const roomId = await roomWithDay("owner@example.com");
    const before = asked.length;
    expect((await draft(roomId, "outsider@example.com")).status).toBe(403);
    expect(asked.length).toBe(before);
  });

  test("past the day's budget nothing is called; a provider error is refunded", async () => {
    const email = "budget@example.com";
    const roomId = await roomWithDay(email);
    // an error from Claude costs nothing: these do not count
    answer = () => ({ status: 529, body: { type: "error" } });
    for (let i = 0; i < PER_DAY + 1; i++) expect((await draft(roomId, email)).status).toBe(502);

    answer = () => proposing({ reason: "r", intro: "i", items: [] });
    for (let i = 0; i < PER_DAY; i++) expect((await draft(roomId, email)).status).toBe(200);
    const before = asked.length;
    const over = await draft(roomId, email);
    expect(await refusal(over)).toEqual([429, { error: "over", ceiling: "day" }]);
    expect(asked.length).toBe(before);
  });

  test("an answer that is not a draft is a failure, and it was spent", async () => {
    const email = "garbled@example.com";
    const roomId = await roomWithDay(email);
    answer = () => ({ status: 200, body: { content: [{ type: "text", text: "Sure!" }] } });
    expect((await draft(roomId, email)).status).toBe(502);
    const index = await server.getWorker().getDurableObjectStorage("RoomsIndex", { name: "index" });
    expect(await index.exec("SELECT refunded FROM spends WHERE email = ?", email)).toEqual([
      { refunded: 0 },
    ]);
  });
});

describe("the agent's suggestions", () => {
  const suggesting = (titles: string[]) => ({
    status: 200,
    body: {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "suggest_notes",
          input: { suggestions: titles.map((title) => ({ title })) },
        },
      ],
      usage: { input_tokens: 90, output_tokens: 30 },
    },
  });
  const suggest = (roomId: string, email: string, body: unknown = { at: { x: 400, y: 300 } }) =>
    post(`/api/rooms/${roomId}/suggest`, email, body);

  test("ideas land as the agent's cards where the asker looks, on every socket", async () => {
    const email = "ideas@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1", "Din Tai Fung"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    answer = () =>
      suggesting([
        "Elephant Mountain at sunset",
        "din tai fung",
        "Beitou hot springs",
        "Jiufen",
        "Yehliu",
      ]);

    const res = await suggest(roomId, email);
    expect(res.status).toBe(200);
    // the one the notes have is left out, and no more than three
    expect(await res.json()).toEqual({ added: 3 });
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).toContain("Din Tai Fung");

    // the asker's own socket gets them too: nobody made them on their device
    const got = [await a.next(), await a.next(), await a.next()];
    expect(got.map((m) => m.type)).toEqual(["mutation", "mutation", "mutation"]);
    for (const m of got) {
      if (m.type !== "mutation" || m.mutation.type !== "note:add") throw new Error("not an add");
      expect(m.by).toBe("agent:claude");
      expect(m.mutation.note).toMatchObject({ kind: "suggestion", by: "agent:claude" });
      expect(Math.abs(m.mutation.note.x - 318)).toBeLessThanOrEqual(12);
    }
    expect(
      got.map((m) =>
        m.type === "mutation" && m.mutation.type === "note:add" ? m.mutation.note.title : "",
      ),
    ).toEqual(["Elephant Mountain at sunset", "Beitou hot springs", "Jiufen"]);

    const room = await server.getWorker().getDurableObjectStorage("Room", { name: roomId });
    expect(
      await room.exec(
        "SELECT COUNT(*) AS n FROM notes WHERE kind = 'suggestion' AND by = 'agent:claude'",
      ),
    ).toEqual([{ n: 3 }]);
    expect(await room.exec("SELECT what FROM agent_calls")).toEqual([{ what: "suggest" }]);
    a.ws.close(1000, "done");
  });

  test("ideas asked for at the desk's edge land on it", async () => {
    const email = "edge-ideas@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    answer = () => suggesting(["Jiufen", "Yehliu", "Beitou hot springs"]);
    const res = await suggest(roomId, email, { at: { x: -1_000_000, y: 1_000_000 } });
    expect(await res.json()).toEqual({ added: 3 });
    for (let i = 0; i < 3; i++) {
      const m = await a.next();
      if (m.type !== "mutation" || m.mutation.type !== "note:add") throw new Error("not an add");
      expect(Math.abs(m.mutation.note.x)).toBeLessThanOrEqual(1_000_000);
      expect(Math.abs(m.mutation.note.y)).toBeLessThanOrEqual(1_000_000);
    }
    a.ws.close(1000, "done");
  });

  test("without where to put them, nothing is called", async () => {
    const email = "nowhere@example.com";
    const { roomId } = await createRoom(email);
    const before = asked.length;
    expect((await suggest(roomId, email, {})).status).toBe(400);
    expect((await suggest(roomId, email, { at: { x: "a", y: 1 } })).status).toBe(400);
    expect(asked.length).toBe(before);
  });

  test("the asker's words and the note they asked from reach the agent", async () => {
    const email = "askwords@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1", "Raohe night market"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");
    answer = () => suggesting(["Shilin night market"]);

    const words = `  something sweet ${"x".repeat(200)}`;
    const res = await suggest(roomId, email, { at: { x: 400, y: 300 }, ask: words, about: "n1" });
    expect(res.status).toBe(200);
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    // trimmed, and no longer than a line
    expect(prompt).toContain(JSON.stringify(words.trim().slice(0, 100)));
    expect(prompt).not.toContain("x".repeat(101));
    expect(prompt).toContain('"title":"Raohe night market"');
    expect(prompt).toContain("They are asking from this note");
  });

  test("blank words and no note ask for anything", async () => {
    const email = "askblank@example.com";
    const { roomId } = await createRoom(email);
    answer = () => suggesting([]);
    const res = await suggest(roomId, email, { at: { x: 0, y: 0 }, ask: "   " });
    expect(res.status).toBe(200);
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).not.toContain("What they asked for");
    expect(prompt).not.toContain("They are asking from this note");
  });

  test("from a note no longer on the desk, nothing is called", async () => {
    const email = "askgone@example.com";
    const { roomId } = await createRoom(email);
    const before = asked.length;
    const res = await suggest(roomId, email, { at: { x: 0, y: 0 }, about: "gone" });
    expect(res.status).toBe(404);
    expect(asked.length).toBe(before);
  });

  test("a provider error writes nothing and costs nothing", async () => {
    const email = "ideasdown@example.com";
    const { roomId } = await createRoom(email);
    answer = () => ({ status: 500, body: { type: "error" } });
    expect((await suggest(roomId, email)).status).toBe(502);
    const room = await server.getWorker().getDurableObjectStorage("Room", { name: roomId });
    expect(await room.exec("SELECT COUNT(*) AS n FROM notes")).toEqual([{ n: 0 }]);
    const index = await server.getWorker().getDurableObjectStorage("RoomsIndex", { name: "index" });
    expect(await index.exec("SELECT refunded FROM spends WHERE email = ?", email)).toEqual([
      { refunded: 1 },
    ]);
  });
});

describe("pictures", () => {
  /** A few bytes standing in for a WebP: the Worker checks the type it is told, not the bytes */
  const BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
  const upload = async (
    roomId: string,
    email: string,
    body: Uint8Array<ArrayBuffer> = BYTES,
    headers: Record<string, string> = {},
  ) =>
    server.fetch(`${APP}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": await token(email),
        Origin: APP,
        "Content-Type": "image/webp",
        ...headers,
      },
      body,
    });
  const fetchImage = async (roomId: string, id: string, email: string) =>
    server.fetch(`${APP}/api/rooms/${roomId}/images/${id}`, {
      headers: { "Cf-Access-Jwt-Assertion": await token(email) },
    });

  test("a member's picture is kept and shown to members only, kept by the browser for good", async () => {
    const email = "photos@example.com";
    const { roomId } = await createRoom(email);
    const res = await upload(roomId, email);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };

    // an <img> sends no Origin
    const got = await fetchImage(roomId, id, email);
    expect(got.status).toBe(200);
    expect(got.headers.get("Content-Type")).toBe("image/webp");
    expect(got.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(BYTES);

    expect((await fetchImage(roomId, id, "stranger-photos@example.com")).status).toBe(403);
    expect((await fetchImage(roomId, crypto.randomUUID(), email)).status).toBe(404);
  });

  test("an upload must come from the app, as a picture, within the size", async () => {
    const email = "badphotos@example.com";
    const { roomId } = await createRoom(email);
    expect((await upload(roomId, email, BYTES, { Origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect((await upload(roomId, email, BYTES, { "Content-Type": "image/svg+xml" })).status).toBe(
      415,
    );
    expect((await upload(roomId, email, new Uint8Array(1024 * 1024 + 1))).status).toBe(413);
    expect((await upload(roomId, email, new Uint8Array(0))).status).toBe(400);
    expect((await upload(roomId, "outsider-photos@example.com")).status).toBe(403);
  });

  test("a card shows only a picture the room has, and can lose it", async () => {
    const email = "cardphoto@example.com";
    const { roomId } = await createRoom(email);
    const { id } = (await (await upload(roomId, email)).json()) as { id: string };
    const a = await connect(roomId, email);

    a.send({ type: "note:add", note: { ...memo("n1"), image: crypto.randomUUID() }, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "no such image", cid: "c1" });

    a.send({ type: "note:add", note: { ...memo("n1"), image: id }, cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:update", id: "n1", patch: { image: null }, cid: "c3" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");

    // a client from before pictures sends no image; the card has none
    const b = await connect(roomId, email);
    const n1 =
      b.snapshot.type === "snapshot" ? b.snapshot.notes.find((n) => n.id === "n1") : undefined;
    expect(n1).toMatchObject({ kind: "memo", image: null });
    b.ws.close(1000, "done");
  });

  test("a sticker is a picture the room has, stuck on the desk, moved and taken away", async () => {
    const email = "stickers@example.com";
    const { roomId } = await createRoom(email);
    const { id } = (await (await upload(roomId, email)).json()) as { id: string };
    const a = await connect(roomId, email);
    const sticker = (image: unknown) => ({
      id: "s1",
      kind: "sticker",
      title: "",
      color: "#ffffff",
      x: 5,
      y: 6,
      rot: -3,
      scale: 1,
      image,
    });

    a.send({ type: "note:add", note: sticker(null), cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation", cid: "c1" });
    a.send({ type: "note:add", note: sticker(crypto.randomUUID()), cid: "c2" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "no such image", cid: "c2" });
    a.send({ type: "note:add", note: sticker(id), cid: "c3" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:move", id: "s1", x: 50, y: 60, rot: 10, scale: 2, cid: "c4" });
    expect((await a.next()).type).toBe("ack");
    // it has no fields of a memo's to change
    a.send({ type: "note:update", id: "s1", patch: { title: "x" }, cid: "c5" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a memo", cid: "c5" });

    const b = await connect(roomId, email);
    expect(b.snapshot).toMatchObject({
      notes: [{ id: "s1", kind: "sticker", image: id, x: 50, y: 60, rot: 10, scale: 2 }],
    });
    // the room's list counts memos, not stickers
    expect((await me(email)).rooms).toMatchObject([{ memos: 0 }]);
    a.send({ type: "note:delete", id: "s1", cid: "c6" });
    expect((await a.next()).type).toBe("ack");
    const c = await connect(roomId, email);
    expect(c.snapshot).toMatchObject({ notes: [] });
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a picture no card shows gives its place back a day on, at the next upload", async () => {
    const email = "unused-photos@example.com";
    const { roomId } = await createRoom(email);
    const kept = async () => ((await (await upload(roomId, email)).json()) as { id: string }).id;
    const shown = await kept();
    const dropped = await kept();
    const recent = await kept();
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: { ...memo("n1"), image: shown }, cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");

    // the first two were uploaded two days ago; the third may still be in an open form
    const worker = server.getWorker();
    const storage = await worker.getDurableObjectStorage("Room", { name: roomId });
    const env = await worker.getEnv();
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await storage.exec(
      `UPDATE pictures SET created_at = '${old}' WHERE id IN ('${shown}', '${dropped}')`,
    );
    expect((await upload(roomId, email)).status).toBe(200);

    expect((await fetchImage(roomId, shown, email)).status).toBe(200);
    expect((await fetchImage(roomId, recent, email)).status).toBe(200);
    expect((await fetchImage(roomId, dropped, email)).status).toBe(404);
    expect(await env.IMAGES.head(`rooms/${roomId}/images/${dropped}`)).toBeNull();
  });

  test("a deleted card's picture gives its place back too", async () => {
    const email = "deleted-card-photo@example.com";
    const { roomId } = await createRoom(email);
    const { id } = (await (await upload(roomId, email)).json()) as { id: string };
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: { ...memo("n1"), image: id }, cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:delete", id: "n1", cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");

    const storage = await server.getWorker().getDurableObjectStorage("Room", { name: roomId });
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await storage.exec(`UPDATE pictures SET created_at = '${old}' WHERE id = '${id}'`);
    expect((await upload(roomId, email)).status).toBe(200);
    expect((await fetchImage(roomId, id, email)).status).toBe(404);
  });
});

describe("turning and resizing a card", () => {
  test("a move may say how the card is turned and how large; one that does not keeps both", async () => {
    const email = "shapes@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:move", id: "n1", x: 50, y: 60, rot: -30, scale: 1.8, cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:move", id: "n1", x: 70, y: 80, cid: "c3" });
    expect((await a.next()).type).toBe("ack");
    // too small, too large, or not a number: refused, and nothing changes
    for (const scale of [0.1, 9, "big"]) {
      a.send({ type: "note:move", id: "n1", x: 0, y: 0, scale, cid: "bad" });
      expect(await a.next()).toMatchObject({ type: "rejected", cid: "bad" });
    }
    a.ws.close(1000, "done");

    const b = await connect(roomId, email);
    const n1 = b.snapshot.type === "snapshot" ? b.snapshot.notes.find((n) => n.id === "n1") : null;
    expect(n1).toMatchObject({ x: 70, y: 80, rot: -30, scale: 1.8 });
    b.ws.close(1000, "done");
  });
});

describe("tags suggested for a memo", () => {
  const proposingTags = (tags: string[]) => ({
    status: 200,
    body: {
      content: [{ type: "tool_use", id: "t1", name: "propose_tags", input: { tags } }],
      usage: { input_tokens: 50, output_tokens: 20 },
    },
  });
  /** Clef's answer: the probability per question id, from a tag -> p map */
  const judging =
    (p: Record<string, number>) => (input: { questions: Record<string, unknown> }) => ({
      status: 200,
      body: {
        model: "clef-flash",
        answers: Object.fromEntries(
          Object.entries(input.questions).map(([id, q]) => {
            const tag = /"#(.+)"\?$/.exec((q as { instructions: string }).instructions)?.[1] ?? "";
            return [id, { type: "noul", noul: p[tag] ?? 0.1 }];
          }),
        ),
      },
    });
  const ask = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/tags`, email, body);

  test("Claude proposes the trip's candidates once; Clef judges each, in use or new", async () => {
    const email = "tagger@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1", "Din Tai Fung"), cid: "c1" }); // tagged #Food
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");

    answer = () => proposingTags(["#Night markets", "Food", "Hot springs", "   "]);
    judge = judging({ Food: 0.4, "Night markets": 0.93, "Hot springs": 0.62 });
    const calls = asked.length;
    const res = await ask(roomId, email, {
      title: "Raohe night market",
      body: "pepper buns",
      image: null,
      chosen: [],
    });
    expect(res.status).toBe(200);
    // every tag with how likely it fits, the unlikely too: the form ranks by it
    expect(await res.json()).toEqual({
      tags: [
        { tag: "Night markets", p: 0.93, isNew: true },
        { tag: "Hot springs", p: 0.62, isNew: true },
        { tag: "Food", p: 0.4, isNew: false },
      ],
    });
    expect(asked.length).toBe(calls + 1);
    // the tag in use and the new candidates ("Food" was in use already, the blank one dropped)
    const questions = Object.values(judged.at(-1)!.questions).map(
      (q) => (q as { instructions: string }).instructions,
    );
    expect(questions).toEqual([
      'Does this travel note belong under the tag "#Food"?',
      'Does this travel note belong under the tag "#Night markets"?',
      'Does this travel note belong under the tag "#Hot springs"?',
    ]);
    expect(judged.at(-1)!.state).toEqual({ title: "Raohe night market", body: "pepper buns" });

    // asked again: the candidates are kept, Claude is not called; a tag already on the memo is not asked about
    const again = await ask(roomId, email, {
      title: "x",
      body: "",
      image: null,
      chosen: ["night markets"],
    });
    expect(again.status).toBe(200);
    expect(asked.length).toBe(calls + 1);
    expect(Object.keys(judged.at(-1)!.questions)).toHaveLength(2);
  });

  test("the trip's candidates are read for free: none before the first ask, then the agent's", async () => {
    const email = "candidates@example.com";
    const { roomId } = await createRoom(email);
    const candidates = () => post(`/api/rooms/${roomId}/candidates`, email, {});
    const calls = asked.length;
    const before = await candidates();
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ tags: [] });
    expect(asked.length).toBe(calls);

    answer = () => proposingTags(["Airport", "Souvenirs"]);
    judge = judging({});
    await ask(roomId, email, { title: "x", body: "", image: null, chosen: [] });
    expect(await (await candidates()).json()).toEqual({ tags: ["Airport", "Souvenirs"] });
    const index = await server.getWorker().getDurableObjectStorage("RoomsIndex", { name: "index" });
    // the ask spent Claude's and Clef's calls; reading the candidates spent nothing
    expect(await index.exec("SELECT id FROM spends WHERE email = ?", email)).toHaveLength(2);
  });

  test("the memo's picture goes to Clef with its words", async () => {
    const email = "tagphoto@example.com";
    const { roomId } = await createRoom(email);
    const up = await server.fetch(`${APP}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": await token(email),
        Origin: APP,
        "Content-Type": "image/webp",
      },
      body: new Uint8Array([1, 2, 3]),
    });
    const { id } = (await up.json()) as { id: string };
    answer = () => proposingTags(["Views"]);
    judge = judging({ Views: 0.8 });
    expect(
      (await ask(roomId, email, { title: "Elephant Mountain", body: "", image: id, chosen: [] }))
        .status,
    ).toBe(200);
    expect(judged.at(-1)!.images).toEqual([{ content_type: "image/webp", base64: "AQID" }]);
  });

  test("a Clef error costs nothing; a bad request is refused before anything is called", async () => {
    const email = "tagdown@example.com";
    const { roomId } = await createRoom(email);
    answer = () => proposingTags(["Food"]);
    judge = () => ({ status: 503, body: {} });
    expect((await ask(roomId, email, { title: "x", body: "", image: null })).status).toBe(502);
    const index = await server.getWorker().getDurableObjectStorage("RoomsIndex", { name: "index" });
    // the candidates' call was spent, Clef's refunded
    expect(
      await index.exec("SELECT refunded FROM spends WHERE email = ? ORDER BY id", email),
    ).toEqual([{ refunded: 0 }, { refunded: 1 }]);
    const before = judged.length;
    expect((await ask(roomId, email, { body: "no title" })).status).toBe(400);
    expect((await ask(roomId, email, { title: "x", image: "not-an-id" })).status).toBe(400);
    expect(judged.length).toBe(before);
  });
});

describe("finding a memo's place", () => {
  const naming = (queries: string[]) => ({
    status: 200,
    body: {
      content: [{ type: "tool_use", id: "t1", name: "name_place", input: { queries } }],
      usage: { input_tokens: 40, output_tokens: 12 },
    },
  });
  const NINGXIA = {
    name: "寧夏夜市",
    display_name: "寧夏夜市, 寧夏路, 大同區, 臺北市, 103, 臺灣",
    lat: "25.0563",
    lon: "121.5154",
    extratags: { opening_hours: "Mo-Su 17:00-01:00\n" },
  };
  const ask = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/places`, email, body);

  test("Claude names the place, the geocoder finds it; the coordinates are the geocoder's", async () => {
    const email = "finder@example.com";
    const { roomId } = await createRoom(email);
    answer = () => naming(["寧夏夜市, 臺北市, 臺灣", "Ningxia Night Market, Taipei"]);
    find = (q) => ({
      status: 200,
      body: q.startsWith("寧夏") ? [NINGXIA, { display_name: "x" }] : [],
    });
    const calls = asked.length;
    const seen = looked.length;

    const res = await ask(roomId, email, {
      title: "寧夏夜市 グルメ食べ歩き",
      body: "",
      tags: ["夜市"],
      lang: "ja",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      places: [
        {
          name: "寧夏夜市",
          address: "寧夏路, 大同區, 臺北市, 103, 臺灣",
          lat: 25.0563,
          lng: 121.5154,
          // its opening hours as OpenStreetMap tags them, on one line
          hours: "Mo-Su 17:00-01:00",
        },
      ],
    });
    // one paid call; one lookup (the first query found it), identified, in the asker's language
    expect(asked.length).toBe(calls + 1);
    expect(looked.slice(seen)).toEqual([
      { q: "寧夏夜市, 臺北市, 臺灣", lang: "ja", agent: expect.stringContaining("chirashitabi") },
    ]);
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).toContain("寧夏夜市 グルメ食べ歩き");
    expect(prompt).toContain("Taiwan trip");
  });

  test("the second query is tried only when the first finds nothing", async () => {
    const email = "finder2@example.com";
    const { roomId } = await createRoom(email);
    answer = () => naming(["nowhere at all", "Ningxia Night Market, Taipei"]);
    find = (q) => ({ status: 200, body: q.startsWith("Ningxia") ? [NINGXIA] : [] });
    const seen = looked.length;
    const res = await ask(roomId, email, { title: "night market", body: "", tags: [], lang: "en" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { places: unknown[] }).places).toHaveLength(1);
    expect(looked.slice(seen).map((l) => l.q)).toEqual([
      "nowhere at all",
      "Ningxia Night Market, Taipei",
    ]);
  });

  test("a memo about no place finds none, and the geocoder is not asked", async () => {
    const email = "finder3@example.com";
    const { roomId } = await createRoom(email);
    answer = () => naming([]);
    const seen = looked.length;
    const res = await ask(roomId, email, {
      title: "pack sunscreen",
      body: "",
      tags: [],
      lang: "ja",
    });
    expect(await res.json()).toEqual({ places: [] });
    expect(looked.length).toBe(seen);
  });

  test("an empty memo is refused before anything is paid; a geocoder that fails is a 502", async () => {
    const email = "finder4@example.com";
    const { roomId } = await createRoom(email);
    const calls = asked.length;
    expect((await ask(roomId, email, { title: "  ", body: "" })).status).toBe(400);
    expect(asked.length).toBe(calls);

    answer = () => naming(["寧夏夜市, 臺北市, 臺灣"]);
    find = () => ({ status: 503, body: {} });
    expect((await ask(roomId, email, { title: "寧夏夜市", body: "" })).status).toBe(502);
  });

  test("only members may ask", async () => {
    const { roomId } = await createRoom("finder5@example.com");
    expect((await ask(roomId, STRANGER, { title: "寧夏夜市" })).status).toBe(403);
  });
});

describe("what is at a pinned point", () => {
  const where = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/where`, email, body);

  test("the place at the point, named in the asker's language, at the point itself; no paid call", async () => {
    const email = "where@example.com";
    const { roomId } = await createRoom(email);
    let asked_at: URL | null = null;
    find = (_, url) => {
      asked_at = url;
      return {
        status: 200,
        body: {
          name: "鼎泰豐 信義店",
          display_name: "鼎泰豐 信義店, 信義路二段, 大安區, 臺北市, 臺灣",
          lat: "25.0336",
          lon: "121.5300",
        },
      };
    };
    const calls = asked.length;
    const res = await where(roomId, email, { lat: 25.03361, lng: 121.53005, lang: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      place: {
        name: "鼎泰豐 信義店",
        address: "信義路二段, 大安區, 臺北市, 臺灣",
        lat: 25.03361,
        lng: 121.53005,
        hours: null,
      },
    });
    expect(asked.length).toBe(calls);
    const url = asked_at as unknown as URL;
    expect(url.pathname).toBe("/reverse");
    expect(url.searchParams.get("extratags")).toBe("1");
    expect(url.searchParams.get("lat")).toBe("25.03361");
    expect(url.searchParams.get("accept-language")).toBe("en");
  });

  test("a point with no name of its own takes its street's, never a bare house number", async () => {
    const email = "where3@example.com";
    const { roomId } = await createRoom(email);
    find = () => ({
      status: 200,
      body: {
        name: "",
        display_name: "36號, 寧夏路, 大同區, 臺北市, 103, 臺灣",
        address: { house_number: "36號", road: "寧夏路", suburb: "大同區", city: "臺北市" },
        lat: "25.0561",
        lon: "121.5152",
      },
    });
    expect(await (await where(roomId, email, { lat: 25.056188, lng: 121.515222 })).json()).toEqual({
      place: {
        name: "寧夏路",
        address: "大同區, 臺北市, 103, 臺灣",
        lat: 25.056188,
        lng: 121.515222,
        hours: null,
      },
    });
  });

  test("nothing there is an answer; a bad point is refused; a geocoder that fails is a 502", async () => {
    const email = "where2@example.com";
    const { roomId } = await createRoom(email);
    find = () => ({ status: 200, body: { error: "Unable to geocode" } });
    expect(await (await where(roomId, email, { lat: 10, lng: 150 })).json()).toEqual({
      place: null,
    });
    expect((await where(roomId, email, { lat: 91, lng: 0 })).status).toBe(400);
    expect((await where(roomId, email, { lat: "25", lng: 121 })).status).toBe(400);
    find = () => ({ status: 503, body: {} });
    expect((await where(roomId, email, { lat: 25, lng: 121 })).status).toBe(502);
    expect((await where(roomId, STRANGER, { lat: 25, lng: 121 })).status).toBe(403);
  });
});

describe("places by a typed name", () => {
  const findByName = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/find`, email, body);

  test("OpenStreetMap is asked the name, in the asker's language; no paid call, no budget", async () => {
    const email = "find@example.com";
    const { roomId } = await createRoom(email);
    find = (q) => ({
      status: 200,
      body:
        q === "Hotel Proverbs Taipei"
          ? [
              {
                name: "Hotel Proverbs",
                display_name: "Hotel Proverbs, 大安路一段, 臺北市",
                lat: "25.0416",
                lon: "121.5489",
              },
            ]
          : [],
    });
    const calls = asked.length;
    const seen = looked.length;
    for (let i = 0; i <= PER_DAY; i++) {
      const res = await findByName(roomId, email, { query: " Hotel Proverbs Taipei ", lang: "en" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        places: [
          {
            name: "Hotel Proverbs",
            address: "大安路一段, 臺北市",
            lat: 25.0416,
            lng: 121.5489,
            hours: null,
          },
        ],
      });
    }
    expect(asked.length).toBe(calls);
    expect(looked[seen]).toMatchObject({ q: "Hotel Proverbs Taipei", lang: "en" });
    // each lookup waits its turn at the geocoder, a second apart
  }, 15_000);

  test("a blank or overlong name is refused; a geocoder that fails is a 502; a stranger is not let in", async () => {
    const email = "find2@example.com";
    const { roomId } = await createRoom(email);
    expect((await findByName(roomId, email, { query: "  " })).status).toBe(400);
    expect((await findByName(roomId, email, { query: "x".repeat(201) })).status).toBe(400);
    find = () => ({ status: 503, body: {} });
    expect((await findByName(roomId, email, { query: "Inn" })).status).toBe(502);
    expect((await findByName(roomId, STRANGER, { query: "Inn" })).status).toBe(403);
  });
});

describe("a link's preview", () => {
  const ask = (roomId: string, email: string, url: string) =>
    post(`/api/rooms/${roomId}/preview`, email, { url });

  test("a page's Open Graph, its picture kept by the room; the call is budgeted", async () => {
    const PREVIEWER = "previewer@example.com";
    const { roomId } = await createRoom(PREVIEWER);
    const res = await ask(roomId, PREVIEWER, "https://blog.example.com/post");
    expect(res.status).toBe(200);
    const { preview } = (await res.json()) as { preview: Record<string, unknown> };
    expect(preview).toMatchObject({
      url: "https://blog.example.com/post",
      site: "blog.example.com",
      title: "Beef noodles & more",
      description: "A bowl worth the queue",
    });
    expect(typeof preview.image).toBe("string");
    // the picture is the room's now, served to its members like any
    const img = await server.fetch(`${APP}/api/rooms/${roomId}/images/${preview.image as string}`, {
      headers: { "Cf-Access-Jwt-Assertion": await token(PREVIEWER) },
    });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    // the budget counted it
    const index = await server.getWorker().getDurableObjectStorage("RoomsIndex", { name: "index" });
    const spent = await index.exec(
      "SELECT COUNT(*) AS n FROM spends WHERE email = ? AND refunded = 0",
      PREVIEWER,
    );
    expect(spent).toEqual([{ n: 1 }]);
  });

  test("a redirect is followed to the page", async () => {
    const MOVER = "mover@example.com";
    const { roomId } = await createRoom(MOVER);
    const moved = (await (await ask(roomId, MOVER, "https://blog.example.com/moved")).json()) as {
      preview: { title: string } | null;
    };
    expect(moved.preview?.title).toBe("Beef noodles & more");
    expect(fetched.some((f) => f.host === "blog.example.com" && f.path === "/post")).toBe(true);
  });

  test("YouTube through its oEmbed; a picture too large is left out; what is no page is no preview", async () => {
    const TUBER = "tuber@example.com";
    const { roomId } = await createRoom(TUBER);
    const yt = (await (await ask(roomId, TUBER, "https://youtu.be/abc")).json()) as {
      preview: Record<string, unknown>;
    };
    expect(yt.preview).toMatchObject({
      site: "youtube.com",
      title: "Night market walk",
      description: "Some Channel",
    });
    expect(typeof yt.preview.image).toBe("string");
    // the bar-free 16:9 frame was asked for, the largest first and then the one every video has
    const frames = fetched.filter((f) => f.host === "i.ytimg.com").map((f) => f.path);
    expect(frames).toEqual(["/vi/abc/maxresdefault.jpg", "/vi/abc/mqdefault.jpg"]);
    // each ask is one of the day's few in the tests: the rest on accounts of their own
    const BIG = "bigpic@example.com";
    const { roomId: bigRoom } = await createRoom(BIG);
    const big = (await (await ask(bigRoom, BIG, "https://blog.example.com/bigpic")).json()) as {
      preview: Record<string, unknown>;
    };
    expect(big.preview).toMatchObject({ title: "Big", image: null });
    const NONE = "nopage@example.com";
    const { roomId: noneRoom } = await createRoom(NONE);
    for (const url of ["https://files.example.com/a.pdf", "https://10.0.0.1/x"]) {
      const none = (await (await ask(noneRoom, NONE, url)).json()) as { preview: unknown };
      expect(none.preview).toBeNull();
    }
    expect((await post(`/api/rooms/${noneRoom}/preview`, NONE, {})).status).toBe(400);
  });
});

describe("a short Google Maps link", () => {
  const expandLink = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/expand`, email, body);

  test("is asked of its host, within the person's budget; one that leads nowhere comes back as it was", async () => {
    const email = "expand@example.com";
    const { roomId } = await createRoom(email);
    const seen = followed.length;
    const short = "https://maps.app.goo.gl/AbC123";
    const res = await expandLink(roomId, email, { url: short });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: short, at: null });
    expect(followed.slice(seen)).toEqual(["/AbC123"]);
    // each expansion is a fetch the person asked for: it spends from the day's budget
    for (let i = 1; i < PER_DAY; i++)
      expect((await expandLink(roomId, email, { url: "https://maps.app.goo.gl/x" })).status).toBe(
        200,
      );
    expect((await expandLink(roomId, email, { url: "https://maps.app.goo.gl/x" })).status).toBe(
      429,
    );
  });

  test("a link that is not a short one comes back as it was, fetched by no one and free", async () => {
    const email = "expand2@example.com";
    const { roomId } = await createRoom(email);
    const seen = followed.length;
    const long = "https://www.google.com/maps/place/x/@25.04,121.55,17z";
    for (let i = 0; i <= PER_DAY; i++)
      expect(await (await expandLink(roomId, email, { url: long })).json()).toEqual({
        url: long,
        at: null,
      });
    expect(followed.length).toBe(seen);
    expect((await expandLink(roomId, email, { url: 42 })).status).toBe(400);
    expect((await expandLink(roomId, STRANGER, { url: long })).status).toBe(403);
  });
});

describe("a preview that is never fetched", () => {
  test("is no preview, and costs nothing of the budget", async () => {
    const email = "unfetched@example.com";
    const { roomId } = await createRoom(email);
    const seen = fetched.length;
    for (const url of ["javascript:alert(1)", "https://10.0.0.1/x", "https://chirashitabi.app/x"])
      expect(await (await post(`/api/rooms/${roomId}/preview`, email, { url })).json()).toEqual({
        preview: null,
      });
    expect(fetched.length).toBe(seen);
    const index = await server.getWorker().getDurableObjectStorage("RoomsIndex", { name: "index" });
    expect(await index.exec("SELECT COUNT(*) AS n FROM spends WHERE email = ?", email)).toEqual([
      { n: 0 },
    ]);
  });
});

describe("what Claude is sent, and what it answers", () => {
  const prompt = () => (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;

  test("a day of long memos sends the latest that fit, not every word", async () => {
    const email = "longday@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    const schedule = { date: TRIP.days[0], time: null, status: "idea" };
    for (let i = 0; i < 12; i++) {
      a.send({
        type: "note:add",
        note: { ...memo(`m${i}`, `memo number ${i}`), body: "w".repeat(4000), schedule },
        cid: `c${i}`,
      });
      expect((await a.next()).type).toBe("ack");
    }
    a.ws.close(1000, "done");
    answer = () => ({
      status: 200,
      body: {
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "propose_day",
            input: { reason: "r", intro: "i", items: [] },
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    expect((await post(`/api/rooms/${roomId}/draft`, email, { date: TRIP.days[0] })).status).toBe(
      200,
    );
    expect(prompt().length).toBeLessThan(32_000);
    expect(prompt()).toContain("memo number 11");
    expect(prompt()).not.toContain("memo number 0");
  });

  test("a memo's tags go to Claude as tags: at most twenty, none longer than one", async () => {
    const email = "longtags@example.com";
    const { roomId } = await createRoom(email);
    answer = () => ({
      status: 200,
      body: {
        content: [{ type: "tool_use", id: "t1", name: "name_place", input: { queries: [] } }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    const tags = ["t".repeat(41), ...Array.from({ length: 25 }, (_, i) => `tag${i}`)];
    expect(
      (await post(`/api/rooms/${roomId}/places`, email, { title: "x", tags, lang: "en" })).status,
    ).toBe(200);
    const memoSent = JSON.parse(prompt().split("\n")[2]!) as { tags: string[] };
    expect(memoSent.tags).toEqual(Array.from({ length: 19 }, (_, i) => `tag${i}`));
  });

  test("a 2xx that is no JSON is a failure, and it was spent", async () => {
    const email = "nojson@example.com";
    const { roomId } = await createRoom(email);
    answer = () => ({ status: 200, body: new TextEncoder().encode("{not json") });
    expect((await post(`/api/rooms/${roomId}/suggest`, email, { at: { x: 0, y: 0 } })).status).toBe(
      502,
    );
    const index = await server.getWorker().getDurableObjectStorage("RoomsIndex", { name: "index" });
    expect(await index.exec("SELECT refunded FROM spends WHERE email = ?", email)).toEqual([
      { refunded: 0 },
    ]);
  });
});

describe("the geocoder's pace", () => {
  test("one request a second for the whole app; one that would wait too long is not sent", async () => {
    const email = "pace@example.com";
    const { roomId } = await createRoom(email);
    find = () => ({ status: 200, body: [] });
    const lookUp = () =>
      post(`/api/rooms/${roomId}/find`, email, { query: "Taipei 101", lang: "en" });
    const started = Date.now();
    const [one, two] = await Promise.all([lookUp(), lookUp()]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    // seven at once: the turns past five seconds ahead are refused, not queued
    const statuses = (await Promise.all(Array.from({ length: 7 }, lookUp))).map((r) => r.status);
    expect(statuses).toContain(200);
    expect(statuses).toContain(502);
  }, 15_000);
});
