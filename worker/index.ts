import { AccessVerifier, Unauthenticated } from "./access";
import { Room } from "./room";
import { parseProfile, parseTrip } from "./wire";

export { Room };
export { RoomsIndex } from "./rooms-index";

let verifier: AccessVerifier | null = null;
const access = (env: Env) =>
  (verifier ??= new AccessVerifier({
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    aud: env.ACCESS_AUD,
    certsUrl: env.ACCESS_CERTS_URL,
  }));

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.host === env.BOOKLET_HOST) return booklet();
    // `wrangler dev` presents requests under the first custom domain, so this holds locally too
    if (url.host !== env.APP_HOST) return new Response("Not Found", { status: 404 });
    if (url.pathname.startsWith("/api/")) return api(request, env, url);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** Published booklets only; nothing here is behind Access, so nothing here may cost anything */
const booklet = () => new Response("Not Found", { status: 404 });

const status = (code: number, text: string) => new Response(text, { status: code });
const ROOM = /^\/api\/rooms\/([0-9a-f-]{36})\/(invite|ws)$/;

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  let email: string;
  try {
    email = await access(env).identify(request);
  } catch (e) {
    if (!(e instanceof Unauthenticated)) throw e;
    console.warn(`401: ${e.message}`);
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
  const [, roomId, action] = m as unknown as [string, string, "invite" | "ws"];
  const memberId = await index.resolve(email, roomId);
  if (memberId === null) return status(403, "Forbidden");
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
