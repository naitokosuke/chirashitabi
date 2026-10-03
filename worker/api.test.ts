import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createTestHarness, type TestHarness } from "wrangler";

import type { ServerMessage } from "./wire";

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
      const body = JSON.parse(raw);
      asked.push(body);
      const { status, body: out } = answer(body);
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => claude.listen(0, "127.0.0.1", resolve));
  const claudePort = (claude.address() as AddressInfo).port;

  server = createTestHarness({
    workers: [
      {
        configPath: "./wrangler.jsonc",
        vars: {
          ACCESS_CERTS_URL: `http://127.0.0.1:${port}/certs`,
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${claudePort}`,
          ANTHROPIC_API_KEY: "test-key",
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

const invite = (roomId: string, by: string, email: string, profile = KEN) =>
  post(`/api/rooms/${roomId}/invite`, by, { email, ...profile });

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
  by: "forged",
  updatedAt: "1999-01-01T00:00:00Z",
  body: "",
  tags: ["Food"],
  mapsUrl: null,
  pin: null,
  schedule: null,
  budget: null,
  checked: false,
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

  test("the booklet host serves nothing yet", async () => {
    const res = await server.fetch("https://shiori.chirashitabi.app/r/anything/shiori");
    expect(res.status).toBe(404);
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

  test.each([
    ["no trip", { me: YUKI }],
    ["no profile", { trip: TRIP }],
    ["a currency Intl does not know", { trip: { ...TRIP, currency: "XXX" }, me: YUKI }],
    ["a day that is not a date", { trip: { ...TRIP, days: ["2026-11-31"] }, me: YUKI }],
    ["no days", { trip: { ...TRIP, days: [] }, me: YUKI }],
    ["a color that is not hex", { trip: TRIP, me: { ...YUKI, color: "red" } }],
    ["a blank name", { trip: TRIP, me: { ...YUKI, name: "  " } }],
  ])("create refuses %s", async (_, body) => {
    expect((await post("/api/rooms", ME, body)).status).toBe(400);
  });

  test("the e-mail is matched case-insensitively", async () => {
    const { roomId } = await createRoom("Mixed.Case@Example.com");
    expect((await invite(roomId, "mixed.case@example.com", PARTNER)).status).toBe(200);
  });

  test("invite is for members only, and a room holds two people", async () => {
    const { roomId } = await createRoom(ME);

    expect((await invite(roomId, STRANGER, PARTNER)).status).toBe(403);
    expect((await invite(roomId, ME, "")).status).toBe(400);
    expect((await post(`/api/rooms/${roomId}/invite`, ME, { email: PARTNER })).status).toBe(400); // no profile

    const ok = await invite(roomId, ME, PARTNER);
    expect(ok.status).toBe(200);
    const { memberId: partner } = (await ok.json()) as { memberId: string };

    expect((await invite(roomId, ME, PARTNER)).status).toBe(409);
    expect((await invite(roomId, PARTNER, "third@example.com")).status).toBe(409); // the room is full

    const room = await server.getWorker().getDurableObjectStorage("Room", { name: roomId });
    const people = await room.exec(
      "SELECT id, name FROM members WHERE kind = 'person' ORDER BY creator DESC",
    );
    expect(people).toEqual([
      { id: expect.any(String), name: "Yuki" },
      { id: partner, name: "Ken" },
    ]);
  });

  test("an unknown room is 404, a room one is not in is 403", async () => {
    const { roomId } = await createRoom(ME);
    expect((await invite("not-a-room-id", ME, PARTNER)).status).toBe(404);
    expect((await invite(crypto.randomUUID(), ME, PARTNER)).status).toBe(403);
    expect((await invite(roomId, STRANGER, PARTNER)).status).toBe(403);
  });

  test("an e-mail may hold ten rooms", async () => {
    const email = "collector@example.com";
    for (let i = 0; i < 10; i++) await createRoom(email);
    expect((await post("/api/rooms", email, { trip: TRIP, me: YUKI })).status).toBe(409);
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
        { id: memberId, kind: "person", name: "Yuki", color: "#3c6ee0" },
        { id: "agent:claude", kind: "agent", name: "Claude", color: "#d97757" },
      ],
      trip: { ...TRIP, days: TRIP.days.map((date) => ({ date, intro: "" })) },
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
    const { memberId: ken } = (await (await invite(roomId, ME, PARTNER)).json()) as {
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
    expect(c.snapshot.notes).toEqual([{ ...memo("n1"), by: yuki, updatedAt: got.updatedAt }]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("updates, moves, recolors, adoption, deletion and the day intro all land", async () => {
    const { roomId, memberId: yuki } = await createRoom(ME);
    await invite(roomId, ME, PARTNER);
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
        by: yuki,
        updatedAt: expect.any(String),
        body: "",
        tags: [],
        mapsUrl: null,
        pin: null,
        schedule: null,
        budget: null,
        checked: false,
      },
    ]);
    expect(c.snapshot.trip.days[1]).toEqual({ date: "2026-11-04", intro: "Jiufen day" });
    expect(c.snapshot.members[0]).toEqual({
      id: yuki,
      kind: "person",
      name: "Yuki K",
      color: "#112233",
    });
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a tick in the appendix reaches the other member and stays; an older client's note is unticked", async () => {
    const { roomId } = await createRoom(ME);
    await invite(roomId, ME, PARTNER);
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

  test("what the room refuses, with the reason, and nobody else hears", async () => {
    const { roomId } = await createRoom(ME);
    await invite(roomId, ME, PARTNER);
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
    b.idle();
    for (const s of [a, b]) s.ws.close(1000, "done");
  });

  test("a mutation with a cid is answered to its sender: ack with the room's time, or rejected with the cid", async () => {
    // its own people: the others above have used up what one e-mail may hold
    const owner = "acks@example.com";
    const partner = "acks-partner@example.com";
    const { roomId } = await createRoom(owner);
    await invite(roomId, owner, partner);
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
          { id: "lunch", time: "12:30" },
          { id: "night", time: "19:00" },
          { id: "not-on-this-day", time: "09:00" },
          { id: "lunch", time: "13:00" },
        ],
      });
    const before = asked.length;
    const res = await draft(roomId, "drafter@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      by: "agent:claude",
      reason: "Lunch first, the market after dark.",
      intro: "Dumplings, then the night market.",
      items: [
        { id: "lunch", time: "12:30" },
        { id: "night", time: "19:00" },
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
    expect(over.status).toBe(429);
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
