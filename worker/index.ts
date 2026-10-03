import type { RequestLogger } from "evlog";
import { initWorkersLogger, withEvlog } from "evlog/workers";

import { AccessVerifier, Unauthenticated } from "./access";
import { draftDay, MODEL } from "./claude";
import { Room } from "./room";
import { isDate, parseProfile, parseTrip } from "./wire";

export { Room };
export { RoomsIndex } from "./rooms-index";

/**
 * Structured logs (evlog): one wide event per API request, built up as the request goes
 * (who, which room, what the budget and Claude said) and emitted once when it answers.
 * Read live with `wrangler tail`. Member and room ids go in; an e-mail never does, and
 * redaction catches one that slips into a message.
 */
initWorkersLogger({ env: { service: "chirashitabi" } });

let verifier: AccessVerifier | null = null;
const access = (env: Env) =>
  (verifier ??= new AccessVerifier({
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    aud: env.ACCESS_AUD,
    certsUrl: env.ACCESS_CERTS_URL,
  }));

export default withEvlog<Env>(
  async (request, env, _ctx, log) => {
    const url = new URL(request.url);
    if (url.host === env.BOOKLET_HOST) return booklet();
    // `wrangler dev` presents requests under the first custom domain, so this holds locally too
    if (url.host !== env.APP_HOST) return new Response("Not Found", { status: 404 });
    if (url.pathname.startsWith("/api/")) return api(request, env, url, log);
    return env.ASSETS.fetch(request);
  },
  // the app's files are not logged, only what the API decides
  { include: ["/api/**"], redact: true },
);

/** Published booklets only; nothing here is behind Access, so nothing here may cost anything */
const booklet = () => new Response("Not Found", { status: 404 });

const status = (code: number, text: string) => new Response(text, { status: code });
const ROOM = /^\/api\/rooms\/([0-9a-f-]{36})\/(invite|ws|draft)$/;

async function api(request: Request, env: Env, url: URL, log: RequestLogger): Promise<Response> {
  let email: string;
  try {
    email = await access(env).identify(request);
  } catch (e) {
    if (!(e instanceof Unauthenticated)) throw e;
    log.set({ auth: { refused: e.message } });
    return status(401, "Unauthorized");
  }

  // Access checks the cookie, not where the request came from. Every API call is a POST
  // with JSON (so the browser always sends Origin) or an upgrade; anything else is refused.
  if (request.headers.get("Origin") !== url.origin) return status(403, "Forbidden");
  const upgrade = request.headers.get("Upgrade") === "websocket";
  if (
    !upgrade &&
    (request.method !== "POST" || request.headers.get("Content-Type") !== "application/json")
  ) {
    return status(403, "Forbidden");
  }

  const index = env.ROOMS.getByName("index");

  if (url.pathname === "/api/me") {
    if (upgrade) return status(403, "Forbidden");
    const ids = await index.rooms(email);
    const rooms = await Promise.all(
      ids.map(async (id) => ({ id, name: await env.ROOM.getByName(id).title() })),
    );
    return Response.json({ rooms });
  }

  if (url.pathname === "/api/rooms") {
    if (upgrade) return status(403, "Forbidden");
    const body = await json(request);
    const trip = parseTrip(body?.trip);
    const me = parseProfile(body?.me);
    if (trip === null || me === null) return status(400, "Bad Request");
    const roomId = crypto.randomUUID();
    const memberId = await env.ROOM.getByName(roomId).create(trip, me);
    if (!(await index.add(email, roomId, memberId))) return status(409, "Conflict");
    return Response.json({ roomId, memberId });
  }

  const m = ROOM.exec(url.pathname);
  if (m === null) return status(404, "Not Found");
  const [, roomId, action] = m as unknown as [string, string, "invite" | "ws" | "draft"];
  const memberId = await index.resolve(email, roomId);
  if (memberId === null) return status(403, "Forbidden");
  log.set({ room: roomId, member: memberId, action });
  const room = env.ROOM.getByName(roomId);

  if (action === "ws") {
    if (!upgrade) return status(403, "Forbidden");
    // Only the upgrade goes through fetch, with the resolved member in a header of our own
    return room.fetch(
      new Request(request.url, {
        headers: { Upgrade: "websocket", [Room.MEMBER_HEADER]: memberId },
      }),
    );
  }

  const body = await json(request);

  if (action === "draft") {
    const date = body?.date;
    if (!isDate(date)) return status(400, "Bad Request");
    const day = await room.dayForDraft(memberId, date);
    if (day === null) return status(400, "Bad Request");
    log.set({ draft: { date, notes: day.notes.length } });
    // reserve, call, settle (docs/auth-and-security.md): nothing is called past the budget
    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return status(429, `Budget: ${reserved.refused}`);
    }
    const result = await draftDay(env, { ...day, date });
    if (!result.ok) {
      if (result.refund) await index.refund(reserved.id);
      log.set({
        claude: { model: MODEL, ok: false, refunded: result.refund, reason: result.reason },
      });
      return status(502, "Bad Gateway");
    }
    await room.recordAgentCall(memberId, "draft", result.usage);
    log.set({
      claude: { model: MODEL, ok: true, tokens: result.usage, items: result.value.items.length },
    });
    return Response.json({ by: Room.AGENT_ID, ...result.value });
  }

  const invitee = parseProfile(body);
  const inviteeEmail = body?.email;
  if (invitee === null || typeof inviteeEmail !== "string" || inviteeEmail === "") {
    return status(400, "Bad Request");
  }
  if ((await index.resolve(inviteeEmail, roomId)) !== null) return status(409, "Conflict");
  const id = await room.invite(memberId, invitee);
  if (id === null) return status(409, "Conflict");
  if (!(await index.add(inviteeEmail, roomId, id))) return status(409, "Conflict");
  return Response.json({ memberId: id });
}

/** The JSON body as a record, or null when it is not one */
async function json(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await request.json();
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
