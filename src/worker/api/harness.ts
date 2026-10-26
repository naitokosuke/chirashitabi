import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import * as v from "valibot";
import { afterAll, beforeAll, beforeEach, expect } from "vite-plus/test";
import {
  createTestHarness,
  experimental_readRawConfig,
  type TestHarness,
  type Unstable_RawConfig,
} from "wrangler";

import { makeWireMemo } from "../../contract/fixtures";
import { IsoInstantSchema, type ServerMessage } from "../../contract/wire";

// The Worker runs in workerd through wrangler's test harness, from the build in dist/ (its
// assets) and the source (its code). Each test file (or describe) that calls useWorker() has a
// Worker of its own, with Durable Objects and stubs of its own: the files run side by side, and
// nothing one leaves behind reaches another. Access is stood in for by signing tokens with a throwaway key
// and serving its public half from a local stub.
const TEAM = "floral-sky-5f24.cloudflareaccess.com";
const AUD = "283aabc752ef29220bf9efc1ca77335383ed2f8753a1e65e45801fbe44f4f65d";
export const APP = "https://chirashitabi.app";
const KID = "test";

/** What the Worker answers a request with */
type Answered = Awaited<ReturnType<TestHarness["fetch"]>>;
/** A Durable Object's own storage, as the harness opens it */
type Storage = Awaited<ReturnType<ReturnType<TestHarness["getWorker"]>["getDurableObjectStorage"]>>;

/** A member's socket, as a test reads it: its messages in order, the first being the snapshot */
interface Socket {
  ws: NonNullable<Answered["webSocket"]>;
  /** The next message; one that comes after a wait that timed out is kept for the next call */
  next(): Promise<ServerMessage>;
  send(m: unknown): void;
  snapshot: Extract<ServerMessage, { type: "snapshot" }>;
  /** Nothing came on this socket that was not read */
  idle(): Promise<void>;
}

let privateKey: CryptoKey;
/** The Worker of the test file that called useWorker() */
export let server: TestHarness;

/** The test's budget: paid calls one person may make in a day */
export const PER_DAY = 3;

/** What a stub answers: a status, and a body sent as JSON (bytes as they are) */
interface Answer {
  status: number;
  body: unknown;
}

/** What Clef is sent */
interface ClefInput {
  state: unknown;
  questions: Record<string, unknown>;
  images?: unknown[];
}

/** An answer each test sets afresh: before it does, a stub fails, so a call nobody expected shows */
const unset = (): Answer => ({ status: 500, body: { error: "no answer set for this test" } });

/**
 * How the stubs answer, set by each test and put back before the next: the Claude API (`answer`),
 * Clef on Workers AI (`judge`), and OpenStreetMap's geocoder (`find`, which finds nothing until
 * told otherwise)
 */
export const stub = {
  answer: unset as (request: { messages: { content: string }[] }) => Answer,
  judge: unset as (input: ClefInput) => Answer,
  find: (() => ({ status: 200, body: [] })) as (query: string, url: URL) => Answer,
};

/** The request bodies the Claude stub got in this test: what was sent, and how many paid calls */
export const asked: unknown[] = [];
/** What Clef was asked in this test */
export const judged: ClefInput[] = [];
/** The geocoder's queries in this test */
export const looked: { q: string | null; lang: string | null; agent: string | undefined }[] = [];
/** The paths the maps.app.goo.gl stub was asked for in this test */
export const followed: string[] = [];
/** What the pages stub was asked for in this test: the host the Worker meant, and the path */
export const fetched: { host: string | undefined; path: string }[] = [];

/** A small PNG: eight bytes of signature and nothing else, enough for a type check */
export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A local server for a stub, listening on a port of its own; its port */
async function listen(s: Server) {
  await new Promise<void>((done) => s.listen(0, "127.0.0.1", done));
  return (s.address() as AddressInfo).port;
}

/** A JSON body as it comes in */
const bodyOf = (req: IncomingMessage) =>
  new Promise<string>((done) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => done(raw));
  });

/** A stub's answer, as JSON or as the bytes it is */
function reply(res: ServerResponse, { status, body }: Answer) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(body instanceof Uint8Array ? body : JSON.stringify(body));
}

/** The pages a note may link to, by host and path */
function servePage(req: IncomingMessage, res: ServerResponse) {
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
  // a page in Shift_JIS that says so only in its markup: its title is ラーメン
  if (host === "blog.example.com" && path === "/sjis") {
    const markup = (s: string) => [...new TextEncoder().encode(s)];
    return answer(
      200,
      "text/html",
      Uint8Array.from([
        ...markup(`<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS"><title>`),
        0x83,
        0x89,
        0x81,
        0x5b,
        0x83,
        0x81,
        0x83,
        0x93,
        ...markup("</title>"),
      ]),
    );
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
}

/**
 * Starts this test file's Worker and its stubs before its tests, stops them after, and puts the
 * stubs' answers and records back before each test. `vars` adds to or overrides the Worker's
 * vars (the geocoder's pace, say).
 */
export function useWorker(vars: Record<string, string> = {}) {
  const stubs: Server[] = [];

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

    const certs = createServer((_, res) => reply(res, { status: 200, body: { keys: [jwk] } }));
    const claude = createServer(async (req, res) => {
      const body = JSON.parse(await bodyOf(req)) as Parameters<typeof stub.answer>[0];
      asked.push(body);
      reply(res, stub.answer(body));
    });
    const clef = createServer(async (req, res) => {
      const body = JSON.parse(await bodyOf(req)) as ClefInput;
      judged.push(body);
      reply(res, stub.judge(body));
    });
    const geocoder = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://stub");
      const q = url.searchParams.get("q");
      looked.push({
        q,
        lang: url.searchParams.get("accept-language"),
        agent: req.headers["user-agent"],
      });
      reply(res, stub.find(q ?? "", url));
    });
    const shortlinks = createServer((req, res) => {
      followed.push(req.url ?? "");
      res.statusCode = 302;
      // a host that never answers: the harness follows a redirect even when told not to
      // (expand.ts), and a test must not reach Google. What a redirect is read as is
      // expand.test.ts's to show
      res.setHeader("Location", "https://www.google.invalid/maps/search/25.0416,+121.5489");
      res.end();
    });
    // the pages a note may link to: a blog with Open Graph tags, its picture, a redirect,
    // YouTube's oEmbed, and a page that is no HTML
    const pages = createServer(servePage);
    stubs.push(certs, claude, clef, geocoder, shortlinks, pages);
    const [certsPort, claudePort, clefPort, geocoderPort, shortlinksPort, pagesPort] =
      await Promise.all(stubs.map(listen));

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
            ACCESS_CERTS_URL: `http://127.0.0.1:${certsPort}/certs`,
            ANTHROPIC_BASE_URL: `http://127.0.0.1:${claudePort}`,
            ANTHROPIC_API_KEY: "test-key",
            CLEF_BASE_URL: `http://127.0.0.1:${clefPort}`,
            GEOCODER_BASE_URL: `http://127.0.0.1:${geocoderPort}`,
            SHORTLINK_BASE_URL: `http://127.0.0.1:${shortlinksPort}`,
            PREVIEW_BASE_URL: `http://127.0.0.1:${pagesPort}`,
            SPEND_PER_DAY: String(PER_DAY),
            // no wait between lookups, unless a file asks for the pace: the geocoder's pace is
            // pace.test.ts's to show
            GEOCODER_SPACING_MS: "0",
            ...vars,
          },
        },
      ],
    });
    await server.listen();
  }, 60_000);

  beforeEach(() => {
    stub.answer = unset;
    stub.judge = unset;
    stub.find = () => ({ status: 200, body: [] });
    for (const record of [asked, judged, looked, followed, fetched]) record.length = 0;
  });

  afterAll(async () => {
    await server?.close();
    for (const s of stubs) s.close();
  });
}

const b64url = (data: Uint8Array | string) => {
  const s = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A token Access would issue for `email` */
export async function token(email: string) {
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
export async function post(
  path: string,
  email: string,
  body: unknown = {},
  headers: Record<string, string> = {},
): Promise<Answered> {
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

/** A picture of the room's as an <img> asks for it: no Origin */
export const fetchImage = async (roomId: string, id: string, email: string): Promise<Answered> =>
  server.fetch(`${APP}/api/rooms/${roomId}/images/${id}`, {
    headers: { "Cf-Access-Jwt-Assertion": await token(email) },
  });

/** The upgrade to a room's socket, as `email` asks for it */
export const upgrade = async (roomId: string, email: string): Promise<Answered> =>
  server.fetch(`${APP}/api/rooms/${roomId}/ws`, {
    headers: { Upgrade: "websocket", Origin: APP, "Cf-Access-Jwt-Assertion": await token(email) },
  });

export const TRIP = {
  name: "Taiwan trip",
  days: ["2026-11-03", "2026-11-04", "2026-11-05"],
  currency: "TWD",
  center: { lat: 25.05, lng: 121.54 },
};
export const YUKI = { name: "Yuki", color: "#3c6ee0" };
export const KEN = { name: "Ken", color: "#d7263d" };

export async function createRoom(email: string) {
  const res = await post("/api/rooms", email, { trip: TRIP, me: YUKI });
  expect(res.status).toBe(200);
  return (await res.json()) as { roomId: string; memberId: string };
}

export const invite = (roomId: string, by: string, email: string): Promise<Answered> =>
  post(`/api/rooms/${roomId}/invite`, by, { email });
export const accept = (roomId: string, email: string, profile: unknown = KEN): Promise<Answered> =>
  post(`/api/invitations/${roomId}/accept`, email, profile);

/** `email` invited by `by` and in, as `profile`: the answer to the acceptance, with the member id */
export async function admit(
  roomId: string,
  by: string,
  email: string,
  profile = KEN,
): Promise<Answered> {
  expect((await invite(roomId, by, email)).status).toBe(200);
  return accept(roomId, email, profile);
}

/** A refusal as the app's client tells it apart: its status, and the JSON saying which it is */
export const refusal = async (res: { status: number; json(): Promise<unknown> }) => [
  res.status,
  await res.json(),
];

/** Now, as the Worker stamps a deletion */
export const now = () => v.parse(IsoInstantSchema, new Date().toISOString());

export const ME = "me@example.com";
export const PARTNER = "partner@example.com";
export const STRANGER = "stranger@example.com"; // allowed by Access, in no room

/** Whom the owner of a room has invited, as the owner asks */
export async function invited(roomId: string, owner: string) {
  const res = await post(`/api/rooms/${roomId}/invited`, owner);
  expect(res.status).toBe(200);
  return ((await res.json()) as { invited: string[] }).invited;
}

/** `/api/me` for `email` */
export const me = async (email: string) =>
  (await (await post("/api/me", email)).json()) as {
    rooms: { id: string }[];
    invitations: { id: string; name: string; members: { name: string }[] }[];
    deleted: { id: string; name: string; deletedAt: string }[];
  };

/**
 * How many paid calls `email` has left today, spending them all to count: short links expanded
 * in `roomId` (one of theirs) until one is refused. Read at a test's end, it shows what that test
 * spent and what it was given back, as the person meets it: a call going through, or a 429.
 */
export async function budgetLeft(roomId: string, email: string) {
  for (let left = 0; left <= PER_DAY; left++) {
    const res = await post(`/api/rooms/${roomId}/expand`, email, {
      url: "https://maps.app.goo.gl/left",
    });
    if (res.status === 429) return left;
    expect(res.status).toBe(200);
  }
  throw new Error(`more than ${PER_DAY} calls left`);
}

/** How long a test waits for a message on a socket before it fails */
const NEXT_MS = 2000;
let barriers = 0;

/** A member's socket, with its messages queued for the test to read in order */
export async function connect(roomId: string, email: string): Promise<Socket> {
  const res = await upgrade(roomId, email);
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
  /** The next message; one that comes after a wait that timed out is queued, not lost */
  const next = () =>
    new Promise<ServerMessage>((done, fail) => {
      const m = queue.shift();
      if (m !== undefined) return done(m);
      const timer = setTimeout(() => {
        waiting.splice(waiting.indexOf(take), 1);
        fail(new Error(`no message within ${NEXT_MS}ms`));
      }, NEXT_MS);
      const take = (got: ServerMessage) => {
        clearTimeout(timer);
        done(got);
      };
      waiting.push(take);
    });
  const send = (m: unknown) => ws.send(typeof m === "string" ? m : JSON.stringify(m));
  /**
   * Nothing came on this socket that was not read. A barrier, not a glance at the queue: a
   * message the room cannot read, sent with a cid, is answered to this socket alone, after
   * everything the room sent it before; so the next message must be that answer
   */
  const idle = async () => {
    const cid = `idle-${barriers++}`;
    send({ type: "idle", cid });
    expect(await next()).toEqual({ type: "rejected", reason: "not a mutation", cid });
  };
  const snapshot = await next();
  if (snapshot.type !== "snapshot") throw new Error(`first message was ${snapshot.type}`);
  return { ws, next, send, snapshot, idle };
}

/** A person's id the room never gave, for a stamp a client forges */
const FORGED = "11111111-1111-4111-8111-111111111111";

/**
 * A memo as a client sends one, with a stamp of its own that the room must not keep: whose and
 * when are the room's to say
 */
export const memo = (id: string, title = "Din Tai Fung") =>
  makeWireMemo(id, {
    title,
    x: 10,
    y: 20,
    tags: ["Food"],
    by: FORGED,
    updatedAt: "1999-01-01T00:00:00Z",
  });

/** A room's own storage, for what only SQL can do: travel in time, or make a room from before */
export const roomStorage = (roomId: string): Promise<Storage> =>
  server.getWorker().getDurableObjectStorage("Room", { name: roomId });

/** The index's own storage, for the same */
export const indexStorage = (): Promise<Storage> =>
  server.getWorker().getDurableObjectStorage("RoomsIndex", { name: "index" });
