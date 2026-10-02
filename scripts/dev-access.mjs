// Stands in for Cloudflare Access on a laptop. Mints a throwaway key pair, serves its
// public half as the JWKS the Worker fetches, writes .dev.vars so `wrangler dev` fetches
// from here, and writes a signed token to .dev-token.local for the Vite proxy to attach.
//
//   vp node scripts/dev-access.mjs [email]      (leave it running; then `wrangler dev` and `vp dev`)

import { webcrypto as crypto } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

const email = process.argv[2] ?? "dev@localhost";
const PORT = 8788;
const TEAM = "floral-sky-5f24.cloudflareaccess.com";
const AUD = "283aabc752ef29220bf9efc1ca77335383ed2f8753a1e65e45801fbe44f4f65d";
const KID = "dev";

const b64url = (data) => {
  const s = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: KID };

const now = Math.floor(Date.now() / 1000);
const h = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
const p = b64url(
  JSON.stringify({
    aud: [AUD],
    iss: `https://${TEAM}`,
    email,
    iat: now,
    nbf: now - 60,
    exp: now + 12 * 3600,
  }),
);
const sig = await crypto.subtle.sign(
  { name: "RSASSA-PKCS1-v1_5" },
  pair.privateKey,
  new TextEncoder().encode(`${h}.${p}`),
);
const token = `${h}.${p}.${b64url(new Uint8Array(sig))}`;

writeFileSync(".dev.vars", `ACCESS_CERTS_URL=http://127.0.0.1:${PORT}/certs\n`);
writeFileSync(".dev-token.local", token);

createServer((_, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ keys: [jwk] }));
}).listen(PORT, "127.0.0.1", () => {
  console.log(
    `Access stub for ${email}: keys at http://127.0.0.1:${PORT}/certs, token in .dev-token.local (12h)`,
  );
});
