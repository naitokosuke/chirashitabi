import { AccessVerifier, Unauthenticated } from "./access";
import { Room } from "./room";

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

const ROOM = /^\/api\/rooms\/([0-9a-f-]{36})\/(invite|ws)$/;

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  let email: string;
  try {
    email = await access(env).identify(request);
  } catch (e) {
    if (!(e instanceof Unauthenticated)) throw e;
    console.warn(`401: ${e.message}`);
    return new Response("Unauthorized", { status: 401 });
  }

  // Access checks the cookie, not where the request came from. Every API call is a POST
  // with JSON (so the browser always sends Origin) or an upgrade; anything else is refused.
  if (request.headers.get("Origin") !== url.origin)
    return new Response("Forbidden", { status: 403 });
  const upgrade = request.headers.get("Upgrade") === "websocket";
  if (
    !upgrade &&
    (request.method !== "POST" || request.headers.get("Content-Type") !== "application/json")
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const index = env.ROOMS.getByName("index");

  if (url.pathname === "/api/rooms") {
    if (upgrade) return new Response("Forbidden", { status: 403 });
    const roomId = crypto.randomUUID();
    const memberId = await env.ROOM.getByName(roomId).create();
    if (!(await index.add(email, roomId, memberId)))
      return new Response("Conflict", { status: 409 });
    return Response.json({ roomId, memberId });
  }

  const m = ROOM.exec(url.pathname);
  if (m === null) return new Response("Not Found", { status: 404 });
  const [, roomId, action] = m as unknown as [string, string, "invite" | "ws"];
  const memberId = await index.resolve(email, roomId);
  if (memberId === null) return new Response("Forbidden", { status: 403 });
  const room = env.ROOM.getByName(roomId);

  if (action === "ws") {
    if (!upgrade) return new Response("Forbidden", { status: 403 });
    // Only the upgrade goes through fetch, with the resolved member in a header of our own
    return room.fetch(
      new Request(request.url, {
        headers: { Upgrade: "websocket", [Room.MEMBER_HEADER]: memberId },
      }),
    );
  }

  const body = (await request.json()) as { email?: unknown };
  if (typeof body.email !== "string" || body.email === "")
    return new Response("Bad Request", { status: 400 });
  if ((await index.resolve(body.email, roomId)) !== null)
    return new Response("Conflict", { status: 409 });
  const invitee = await room.invite(memberId);
  if (invitee === null) return new Response("Conflict", { status: 409 });
  if (!(await index.add(body.email, roomId, invitee)))
    return new Response("Conflict", { status: 409 });
  return Response.json({ memberId: invitee });
}
