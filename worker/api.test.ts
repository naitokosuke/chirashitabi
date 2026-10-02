import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createTestHarness, type TestHarness } from "wrangler";

// The Worker runs in workerd through wrangler's test harness. Access is stood in for by
// signing tokens with a throwaway key and serving its public half from a local stub.
const TEAM = "floral-sky-5f24.cloudflareaccess.com";
const AUD = "283aabc752ef29220bf9efc1ca77335383ed2f8753a1e65e45801fbe44f4f65d";
const APP = "https://chirashitabi.app";
const KID = "test";

let privateKey: CryptoKey;
let certs: Server;
let server: TestHarness;

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

  server = createTestHarness({
    workers: [
      {
        configPath: "./wrangler.jsonc",
        vars: { ACCESS_CERTS_URL: `http://127.0.0.1:${port}/certs` },
      },
    ],
  });
  await server.listen();
}, 60_000);

afterAll(async () => {
  await server?.close();
  certs?.close();
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

async function createRoom(email: string) {
  const res = await post("/api/rooms", email);
  expect(res.status).toBe(200);
  return (await res.json()) as { roomId: string; memberId: string };
}

const ME = "me@example.com";
const PARTNER = "partner@example.com";
const STRANGER = "stranger@example.com"; // allowed by Access, in no room

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
  test("create mints the creator and the agent, and records the membership", async () => {
    const { roomId, memberId } = await createRoom(ME);
    expect(roomId).toMatch(/^[0-9a-f-]{36}$/);

    const worker = server.getWorker();
    const room = await worker.getDurableObjectStorage("Room", { name: roomId });
    const members = await room.exec("SELECT id, kind, creator FROM members ORDER BY kind");
    expect(members).toEqual([
      { id: "agent:claude", kind: "agent", creator: 0 },
      { id: memberId, kind: "person", creator: 1 },
    ]);

    const index = await worker.getDurableObjectStorage("RoomsIndex", { name: "index" });
    const rows = await index.exec(
      "SELECT email, member_id FROM memberships WHERE room_id = ?",
      roomId,
    );
    expect(rows).toEqual([{ email: ME, member_id: memberId }]);
  });

  test("the e-mail is matched case-insensitively", async () => {
    const { roomId } = await createRoom("Mixed.Case@Example.com");
    const res = await post(`/api/rooms/${roomId}/invite`, "mixed.case@example.com", {
      email: PARTNER,
    });
    expect(res.status).toBe(200);
  });

  test("invite is for members only, and a room holds two people", async () => {
    const { roomId } = await createRoom(ME);

    expect((await post(`/api/rooms/${roomId}/invite`, STRANGER, { email: PARTNER })).status).toBe(
      403,
    );
    expect((await post(`/api/rooms/${roomId}/invite`, ME, { email: "" })).status).toBe(400);

    const ok = await post(`/api/rooms/${roomId}/invite`, ME, { email: PARTNER });
    expect(ok.status).toBe(200);
    const { memberId: partner } = (await ok.json()) as { memberId: string };

    expect((await post(`/api/rooms/${roomId}/invite`, ME, { email: PARTNER })).status).toBe(409);
    const third = await post(`/api/rooms/${roomId}/invite`, PARTNER, {
      email: "third@example.com",
    });
    expect(third.status).toBe(409); // the room is full

    const room = await server.getWorker().getDurableObjectStorage("Room", { name: roomId });
    const people = await room.exec(
      "SELECT id FROM members WHERE kind = 'person' ORDER BY creator DESC",
    );
    expect(people.map((r) => r.id)).toEqual([expect.any(String), partner]);
  });

  test("an unknown room is 404, a room one is not in is 403", async () => {
    const { roomId } = await createRoom(ME);
    expect((await post(`/api/rooms/not-a-room-id/invite`, ME, { email: PARTNER })).status).toBe(
      404,
    );
    expect(
      (await post(`/api/rooms/${crypto.randomUUID()}/invite`, ME, { email: PARTNER })).status,
    ).toBe(403);
    expect((await post(`/api/rooms/${roomId}/invite`, STRANGER, { email: PARTNER })).status).toBe(
      403,
    );
  });

  test("an e-mail may hold ten rooms", async () => {
    const email = "collector@example.com";
    for (let i = 0; i < 10; i++) await createRoom(email);
    expect((await post("/api/rooms", email)).status).toBe(409);
  });
});

describe("the socket", () => {
  const open = async (roomId: string, email: string) =>
    server.fetch(`${APP}/api/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket", Origin: APP, "Cf-Access-Jwt-Assertion": await token(email) },
    });

  test("a member connects and hears the echo", async () => {
    const { roomId } = await createRoom(ME);
    const res = await open(roomId, ME);
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (ws === null || ws === undefined) throw new Error("no socket on the response");
    ws.accept();
    const echoed = new Promise<string>((resolve) =>
      ws.addEventListener("message", (e) => resolve(String(e.data))),
    );
    ws.send("hi");
    expect(await echoed).toBe("hi");
    ws.close(1000, "done");
  });

  test("not a member: no socket", async () => {
    const { roomId } = await createRoom(ME);
    expect((await open(roomId, STRANGER)).status).toBe(403);
  });

  test("the upgrade needs the Origin too", async () => {
    const { roomId } = await createRoom(ME);
    const res = await server.fetch(`${APP}/api/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket", "Cf-Access-Jwt-Assertion": await token(ME) },
    });
    expect(res.status).toBe(403);
  });
});
