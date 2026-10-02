import { beforeAll, describe, expect, test } from "vite-plus/test";

import { AccessVerifier, Unauthenticated } from "./access";

// A throwaway key pair stands in for the team's: the tests sign what Access would sign.
const TEAM = "team.cloudflareaccess.com";
const AUD = "a".repeat(64);
const KID = "kid-1";

let privateKey: CryptoKey;
let jwk: JsonWebKey;

beforeAll(async () => {
  const pair = await generate();
  privateKey = pair.privateKey;
  jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
});

const generate = () =>
  crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  ) as Promise<CryptoKeyPair>;

const b64url = (data: Uint8Array | string) => {
  const s = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const NOW = 1_800_000_000_000;
const seconds = (ms: number) => Math.floor(ms / 1000);

async function sign(claims: Record<string, unknown>, kid = KID, key = privateKey) {
  const h = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const p = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

const good = () => ({
  aud: [AUD],
  iss: `https://${TEAM}`,
  email: "me@example.com",
  exp: seconds(NOW) + 3600,
  nbf: seconds(NOW) - 60,
  iat: seconds(NOW) - 60,
});

function certs(keys: JsonWebKey[]) {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return Response.json({
      keys: keys.map((k, i) => ({ ...k, kid: i === 0 ? KID : `kid-${i + 1}` })),
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

const request = (token?: string) =>
  new Request("https://app.test/api/x", {
    headers: token === undefined ? {} : { "Cf-Access-Jwt-Assertion": token },
  });

describe("identify", () => {
  test("returns the e-mail of a token Access would issue", async () => {
    const v = new AccessVerifier({ teamDomain: TEAM, aud: AUD }, certs([jwk]).fetchImpl, () => NOW);
    expect(await v.identify(request(await sign(good())))).toBe("me@example.com");
  });

  test("a missing header is not development", async () => {
    const v = new AccessVerifier({ teamDomain: TEAM, aud: AUD }, certs([jwk]).fetchImpl, () => NOW);
    await expect(v.identify(request())).rejects.toBeInstanceOf(Unauthenticated);
  });

  test.each([
    ["another application's aud", { aud: ["b".repeat(64)] }],
    ["another team's iss", { iss: "https://other.cloudflareaccess.com" }],
    ["expired past the skew", { exp: seconds(NOW) - 61 }],
    ["not yet valid past the skew", { nbf: seconds(NOW) + 61 }],
    ["no email", { email: "" }],
  ])("rejects %s", async (_, override) => {
    const v = new AccessVerifier({ teamDomain: TEAM, aud: AUD }, certs([jwk]).fetchImpl, () => NOW);
    await expect(v.verify(await sign({ ...good(), ...override }))).rejects.toBeInstanceOf(
      Unauthenticated,
    );
  });

  test("tolerates 60 seconds of skew", async () => {
    const v = new AccessVerifier({ teamDomain: TEAM, aud: AUD }, certs([jwk]).fetchImpl, () => NOW);
    expect(
      await v.verify(await sign({ ...good(), exp: seconds(NOW) - 30, nbf: seconds(NOW) + 30 })),
    ).toBe("me@example.com");
  });

  test("rejects a token signed by another key, even with a known kid", async () => {
    const other = await generate();
    const v = new AccessVerifier({ teamDomain: TEAM, aud: AUD }, certs([jwk]).fetchImpl, () => NOW);
    await expect(v.verify(await sign(good(), KID, other.privateKey))).rejects.toBeInstanceOf(
      Unauthenticated,
    );
  });

  test("caches the keys and refetches on an unknown kid", async () => {
    const c = certs([jwk]);
    const v = new AccessVerifier({ teamDomain: TEAM, aud: AUD }, c.fetchImpl, () => NOW);
    await v.verify(await sign(good()));
    await v.verify(await sign(good()));
    expect(c.calls()).toBe(1);
    await expect(v.verify(await sign(good(), "kid-rotated"))).rejects.toBeInstanceOf(
      Unauthenticated,
    );
    expect(c.calls()).toBe(1); // the unknown kid came within a minute of the last fetch
  });

  test("fails closed when the keys cannot be fetched", async () => {
    const failing = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    const v = new AccessVerifier({ teamDomain: TEAM, aud: AUD }, failing, () => NOW);
    await expect(v.verify(await sign(good()))).rejects.toBeInstanceOf(Unauthenticated);
  });

  test("uses a cache under seven days old when a refetch fails, and not an older one", async () => {
    let now = NOW;
    let up = true;
    const c = certs([jwk]);
    const fetchImpl = (async (...args: Parameters<typeof fetch>) =>
      up ? c.fetchImpl(...args) : new Response("down", { status: 503 })) as unknown as typeof fetch;
    const v = new AccessVerifier({ teamDomain: TEAM, aud: AUD }, fetchImpl, () => now);
    await v.verify(await sign(good()));

    up = false;
    now = NOW + 6 * 24 * 60 * 60 * 1000;
    const later = () => sign({ ...good(), exp: seconds(now) + 3600, nbf: seconds(now) - 60 });
    expect(await v.verify(await later())).toBe("me@example.com");

    now = NOW + 8 * 24 * 60 * 60 * 1000;
    await expect(v.verify(await later())).rejects.toBeInstanceOf(Unauthenticated);
  });
});
