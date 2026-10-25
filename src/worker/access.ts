/**
 * Who is asking. Cloudflare Access puts a JWT on every request it lets through;
 * this is the only code that reads it, and it answers with a verified e-mail or throws.
 * A missing token is never "development": local runs sign their own token (see README).
 */

import * as v from "valibot";

import { listOf, parseEmail, type Email } from "../contract";

export interface AccessConfig {
  /** `<team>.cloudflareaccess.com`: the issuer, and where the signing keys are served */
  teamDomain: string;
  /** The application's AUD tag; a token for any other application on the team must not pass */
  aud: string;
  /** Where the signing keys are fetched from; tests and local runs point it at a stub. Defaults to the team's. */
  certsUrl?: string;
}

export class Unauthenticated extends Error {}

const HEADER = "Cf-Access-Jwt-Assertion";
const SKEW_S = 60;
/** Keys rotate every six weeks and the old one stays valid for seven days; older than that, a cache is not trusted */
const KEYS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** An unknown `kid` refetches the keys, but not more often than this */
const REFETCH_MIN_INTERVAL_MS = 60 * 1000;

/** A signing key of the certs, as one Access signs with: RSA, with its id */
const RsaJwkSchema = v.object({
  kid: v.string(),
  kty: v.literal("RSA"),
  n: v.string(),
  e: v.string(),
});

/** The certs as Access serves them: the keys Access signs with; any other key is left out */
const CertsSchema = v.fallback(v.object({ keys: listOf(RsaJwkSchema) }), { keys: [] });

/** A token's header as Access writes it: RS256, and which key signed it */
const HeaderSchema = v.object({ alg: v.literal("RS256"), kid: v.string() });

/**
 * The claims checked, in the shapes the JWT spec gives them: one audience or several, the
 * issuer, when it expires and, when it says, from when it is valid. The e-mail is parsed on its own.
 */
const ClaimsSchema = v.object({
  aud: v.union([v.string(), v.array(v.string())]),
  iss: v.string(),
  exp: v.number(),
  nbf: v.optional(v.number()),
  email: v.unknown(),
});

interface Keys {
  fetchedAt: number;
  byKid: Map<string, CryptoKey>;
}

export class AccessVerifier {
  #keys: Keys | null = null;

  constructor(
    private readonly config: AccessConfig,
    // Wrapped: workerd's fetch refuses to run with another `this`, which a class field would give it
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now,
  ) {}

  /** The verified e-mail behind `request`, or `Unauthenticated` */
  async identify(request: Request): Promise<Email> {
    const token = request.headers.get(HEADER);
    if (token === null) throw new Unauthenticated(`no ${HEADER}`);
    return this.verify(token);
  }

  async verify(token: string): Promise<Email> {
    const [h, p, s, ...rest] = token.split(".");
    if (h === undefined || p === undefined || s === undefined || rest.length > 0)
      throw new Unauthenticated("malformed token");

    const header = v.safeParse(HeaderSchema, json(h));
    if (!header.success) throw new Unauthenticated("unexpected token header");
    const key = await this.key(header.output.kid);
    const signed = new TextEncoder().encode(`${h}.${p}`);
    const ok = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, bytes(s), signed);
    if (!ok) throw new Unauthenticated("bad signature");

    const read = v.safeParse(ClaimsSchema, json(p));
    if (!read.success) throw new Unauthenticated("unexpected claims");
    const claims = read.output;
    const now = Math.floor(this.now() / 1000);
    if (![claims.aud].flat().includes(this.config.aud))
      throw new Unauthenticated("aud is not this application");
    if (claims.iss !== `https://${this.config.teamDomain}`)
      throw new Unauthenticated("iss is not the team");
    if (now > claims.exp + SKEW_S) throw new Unauthenticated("expired");
    if (claims.nbf !== undefined && now + SKEW_S < claims.nbf)
      throw new Unauthenticated("not yet valid");
    const email = parseEmail(claims.email);
    if (email === null) throw new Unauthenticated("no email");
    return email;
  }

  async key(kid: string): Promise<CryptoKey> {
    const cached = this.#keys;
    const age = cached === null ? Infinity : this.now() - cached.fetchedAt;
    const known = cached?.byKid.get(kid);
    if (known !== undefined && age < KEYS_MAX_AGE_MS) return known;

    if (age >= REFETCH_MIN_INTERVAL_MS) {
      try {
        this.#keys = await this.fetchKeys();
      } catch (e) {
        // A stale cache is still better than nothing, but not past its trusted age
        if (cached === null || age >= KEYS_MAX_AGE_MS)
          throw new Unauthenticated(`keys unavailable: ${String(e)}`);
      }
    }
    const key = this.#keys?.byKid.get(kid);
    if (key === undefined) throw new Unauthenticated("unknown key id");
    return key;
  }

  private async fetchKeys(): Promise<Keys> {
    const url = this.config.certsUrl ?? `https://${this.config.teamDomain}/cdn-cgi/access/certs`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`certs ${res.status}`);
    const { keys } = v.parse(CertsSchema, await res.json());
    const byKid = new Map<string, CryptoKey>();
    for (const jwk of keys) {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      byKid.set(jwk.kid, key);
    }
    return { fetchedAt: this.now(), byKid };
  }
}

/** A part of a token as its bytes; a part that is no base64url is no token */
const bytes = (b64url: string): Uint8Array => {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  let decoded: string;
  try {
    decoded = atob(b64);
  } catch {
    throw new Unauthenticated("malformed token");
  }
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
};

/** A part of a token as the JSON object it is, its fields still to be checked */
const json = (b64url: string): Record<string, unknown> => {
  try {
    return v.parse(
      v.record(v.string(), v.unknown()),
      JSON.parse(new TextDecoder().decode(bytes(b64url))),
    );
  } catch {
    throw new Unauthenticated("malformed token");
  }
};
