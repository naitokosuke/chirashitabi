import type { RequestLogger } from "evlog";
import { initWorkersLogger, withEvlog } from "evlog/workers";

import { isShortMapsLink, parseMapsUrl } from "../src/app/features/place/google-maps";

import { AccessVerifier, Unauthenticated } from "./access";
import { draftDay, MODEL, namePlace, proposeTags, suggestNotes } from "./claude";
import { CLEF_MODEL, FITS_AT, judgeTags, MAX_TAGS } from "./clef";
import { expand, placeName } from "./expand";
import { geocode, reverseGeocode, SPACING_MS, type Place } from "./geocode";
import { Room } from "./room";
import { RoomsIndex } from "./rooms-index";
import {
  IMAGE_TYPES,
  isDate,
  isImageId,
  MAX_IMAGE_BYTES,
  parseEmail,
  parsePoint,
  parseProfile,
  parseTrip,
} from "./wire";

export { Room, RoomsIndex };

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
type RoomAction =
  | "ws"
  | "draft"
  | "suggest"
  | "tags"
  | "candidates"
  | "places"
  | "where"
  | "expand"
  | "invited"
  | "invite"
  | "uninvite"
  | "remove"
  | "leave"
  | "delete"
  | "restore"
  | "purge";
const ROOM =
  /^\/api\/rooms\/([0-9a-f-]{36})\/(ws|draft|suggest|tags|candidates|places|where|expand|invited|invite|uninvite|remove|leave|delete|restore|purge)$/;
/** An invitation to a room, answered by the person invited */
const INVITATION = /^\/api\/invitations\/([0-9a-f-]{36})\/(accept|decline)$/;
/** A room's pictures: POST to upload one, GET `/images/<id>` to show it */
const IMAGES = /^\/api\/rooms\/([0-9a-f-]{36})\/images(?:\/([0-9a-f-]{36}))?$/;

/**
 * Pictures, for the room's members. A GET comes from an <img>, which sends no Origin and no
 * JSON; it only reads, so it passes with Access's identity and the membership alone. An
 * upload is a POST of the picture's bytes and must come from the app's origin, like any
 * call that changes something.
 */
async function images(
  request: Request,
  env: Env,
  url: URL,
  email: string,
  [, roomId, imageId]: RegExpExecArray,
  log: RequestLogger,
): Promise<Response> {
  const memberId = await env.ROOMS.getByName("index").resolve(email, roomId!);
  if (memberId === null) return status(403, "Forbidden");
  const room = env.ROOM.getByName(roomId!);
  log.set({ room: roomId, member: memberId, action: "image" });

  // the room's own folder in the bucket: one room's ids never reach another's pictures
  const key = (id: string) => `rooms/${roomId}/images/${id}`;

  if (imageId !== undefined) {
    if (request.method !== "GET") return status(405, "Method Not Allowed");
    if (!(await room.hasImageFor(memberId, imageId))) return status(404, "Not Found");
    const object = await env.IMAGES.get(key(imageId));
    if (object === null) return status(404, "Not Found");
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        // an id is never reused for other bytes; only this person's browser keeps it
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (request.method !== "POST" || request.headers.get("Origin") !== url.origin)
    return status(403, "Forbidden");
  const type = request.headers.get("Content-Type") ?? "";
  if (!(IMAGE_TYPES as readonly string[]).includes(type))
    return status(415, "Unsupported Media Type");
  if (Number(request.headers.get("Content-Length") ?? "0") > MAX_IMAGE_BYTES)
    return status(413, "Payload Too Large");
  const data = await request.arrayBuffer();
  if (data.byteLength === 0) return status(400, "Bad Request");
  if (data.byteLength > MAX_IMAGE_BYTES) return status(413, "Payload Too Large");
  // the room's list first, so its cap holds; the bytes after, and the entry goes if they fail
  const id = await room.addImage(memberId, type, data.byteLength);
  log.set({ image: { type, bytes: data.byteLength, stored: id !== null } });
  if (id === null) return status(409, "Conflict");
  try {
    await env.IMAGES.put(key(id), data, { httpMetadata: { contentType: type } });
  } catch (e) {
    await room.dropImage(id);
    throw e;
  }
  return Response.json({ id });
}

async function api(request: Request, env: Env, url: URL, log: RequestLogger): Promise<Response> {
  let email: string;
  try {
    email = await access(env).identify(request);
  } catch (e) {
    if (!(e instanceof Unauthenticated)) throw e;
    log.set({ auth: { refused: e.message } });
    return status(401, "Unauthorized");
  }

  const pictures = IMAGES.exec(url.pathname);
  if (pictures !== null) return images(request, env, url, email, pictures, log);

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
    const [mine, invitedTo, deletedIds] = await Promise.all([
      index.memberships(email),
      index.invitations(email),
      index.rooms(email, true),
    ]);
    // each at a glance, and whether the asker made it (and so may delete it from the list)
    const glance = async (id: string, by: string | null = null) => ({
      id,
      ...(await env.ROOM.getByName(id).summary(by)),
    });
    const rooms = await Promise.all(mine.map((m) => glance(m.roomId, m.memberId)));
    // an invitation shows the trip it is to, its owner leading the members
    const invitations = await Promise.all(invitedTo.map((id) => glance(id)));
    // a deleted trip, to the people who were in it, who may restore it
    const deleted = (
      await Promise.all(
        deletedIds.map(async (id) => {
          const by = await index.resolve(email, id, true);
          const d = by === null ? null : await env.ROOM.getByName(id).deletedFor(by);
          return d === null ? [] : [{ id, ...d }];
        }),
      )
    ).flat();
    return Response.json({ rooms, invitations, deleted });
  }

  const answer = INVITATION.exec(url.pathname);
  if (answer !== null) {
    if (upgrade) return status(403, "Forbidden");
    const [, roomId, verb] = answer as unknown as [string, string, "accept" | "decline"];
    log.set({ room: roomId, action: verb });
    const room = env.ROOM.getByName(roomId);
    if (verb === "decline") {
      const seat = await index.take(email, roomId);
      if (seat === null) return status(404, "Not Found");
      await room.closeSeat(seat);
      return Response.json({});
    }
    // who they will be in the room is theirs to say, checked before the seat is taken
    const me = parseProfile(await json(request));
    if (me === null) return status(400, "Bad Request");
    const seat = await index.take(email, roomId);
    if (seat === null) return status(404, "Not Found");
    const memberId = await room.accept(seat, me);
    if (memberId === null) return status(409, "Conflict");
    if (!(await index.add(email, roomId, memberId))) {
      // at the cap of rooms: the seat is lost, as a declined one would be
      await room.unaccept(memberId);
      return status(409, "Conflict");
    }
    log.set({ member: memberId });
    return Response.json({ memberId });
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
  const [, roomId, action] = m as unknown as [string, string, RoomAction];

  if (action === "restore" || action === "purge") {
    if (upgrade) return status(403, "Forbidden");
    // a deleted room resolves nobody, but the people who were in it may take the deletion
    // back, and its owner may have it gone for good at once (the room drops itself from here)
    const member = await index.resolve(email, roomId, true);
    if (member === null) return status(403, "Forbidden");
    log.set({ room: roomId, member, action });
    const room = env.ROOM.getByName(roomId);
    if (action === "purge") {
      if (!(await room.purge(member))) return status(403, "Forbidden");
      return Response.json({});
    }
    if (!(await room.restore(member))) return status(403, "Forbidden");
    await index.mark(roomId, null);
    return Response.json({});
  }

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

  if (action === "tags") {
    // the memo as it is being written: its words, the tags it has, and its picture
    const title = typeof body?.title === "string" ? body.title.slice(0, 200) : null;
    const text = typeof body?.body === "string" ? body.body.slice(0, 4000) : "";
    const chosen = Array.isArray(body?.chosen)
      ? body.chosen.filter((t): t is string => typeof t === "string")
      : [];
    const imageId = body?.image ?? null;
    if (title === null || !(imageId === null || isImageId(imageId)))
      return status(400, "Bad Request");

    const context = await room.tagContext(memberId);
    let candidates = context.candidates;
    // the trip's candidates, once: Claude proposes them the first time anyone asks
    if (candidates.length === 0) {
      const reserved = await index.reserve(email, roomId);
      if ("refused" in reserved) {
        log.set({ budget: { refused: reserved.refused } });
        return status(429, `Budget: ${reserved.refused}`);
      }
      const proposed = await proposeTags(env, context);
      if (proposed.ok) {
        await room.recordAgentCall(memberId, "tags", proposed.usage);
        await room.saveCandidates(memberId, proposed.value);
        candidates = proposed.value;
      } else if (proposed.refund) await index.refund(reserved.id);
      // without candidates Clef still judges the tags in use
      log.set({ claude: { model: MODEL, ok: proposed.ok, candidates: candidates.length } });
    }

    const taken = new Set(chosen.map((t) => t.toLowerCase()));
    const vocabulary = [...new Set([...context.tags, ...candidates])]
      .filter((t) => !taken.has(t.toLowerCase()))
      .slice(0, MAX_TAGS);
    if (vocabulary.length === 0) return Response.json({ tags: [] });

    // the picture goes along: Clef looks at it with the words
    let image: { type: string; base64: string } | null = null;
    if (imageId !== null && (await room.hasImageFor(memberId, imageId))) {
      const object = await env.IMAGES.get(`rooms/${roomId}/images/${imageId}`);
      if (object !== null)
        image = {
          type: object.httpMetadata?.contentType ?? "image/webp",
          base64: toBase64(await object.arrayBuffer()),
        };
    }

    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return status(429, `Budget: ${reserved.refused}`);
    }
    const judged = await judgeTags(env, { title, body: text, image }, vocabulary);
    if (!judged.ok) {
      if (judged.refund) await index.refund(reserved.id);
      log.set({
        clef: { model: CLEF_MODEL, ok: false, refunded: judged.refund, reason: judged.reason },
      });
      return status(502, "Bad Gateway");
    }
    await room.recordAgentCall(memberId, "tag", { input: 0, output: 0 });
    // how likely the likeliest were, numbers only: what the threshold should be is read here
    log.set({
      clef: {
        model: CLEF_MODEL,
        ok: true,
        asked: vocabulary.length,
        fitting: judged.tags.filter((t) => t.p >= FITS_AT).length,
        top: judged.tags.slice(0, 3).map((t) => Math.round(t.p * 100) / 100),
      },
    });
    const inUse = new Set(context.tags);
    return Response.json({
      tags: judged.tags.map((t) => ({ tag: t.tag, p: t.p, isNew: !inUse.has(t.tag) })),
    });
  }

  if (action === "candidates") {
    // the trip's candidate tags, for the form to rank as the words are typed: free, so not budgeted
    const { candidates } = await room.tagContext(memberId);
    return Response.json({ tags: candidates });
  }

  if (action === "expand") {
    // a short Google Maps link, expanded by reading its one redirect; anything else is answered
    // as it came, without a fetch. A fetch of a URL a person typed counts against their budget
    const url = body?.url;
    if (typeof url !== "string" || url.length > 2000) return status(400, "Bad Request");
    if (!isShortMapsLink(url)) return Response.json({ url, at: null });
    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return status(429, `Budget: ${reserved.refused}`);
    }
    const expanded = await expand(url, env.SHORTLINK_BASE_URL);
    // a short link most often leads to the place's name (`/maps/place/<name>/data=…`, or
    // `?q=<name>`), not its point: then OpenStreetMap finds the name, free, and its point is the link's
    let at: { lat: number; lng: number } | null = null;
    const point = expanded === null ? null : parseMapsUrl(expanded);
    const name = expanded === null || point !== null ? null : placeName(expanded);
    if (name !== null) {
      const found = await geocode(env, name, body?.lang === "en" ? "en" : "ja");
      const first = found?.[0];
      if (first !== undefined) at = { lat: first.lat, lng: first.lng };
    }
    // the shape it led to, not the place: enough to tell which way a link that found nothing went
    const shape =
      expanded === null ? null : (/\/maps\/(\w+)/.exec(new URL(expanded).pathname)?.[1] ?? "root");
    log.set({
      expand: { ok: expanded !== null, shape, point: point !== null, named: name !== null },
      geocoder: { ok: name === null || at !== null },
    });
    return Response.json({ url: expanded ?? url, at });
  }

  if (action === "where") {
    // what is at a point the asker pinned on the map: free (no agent), so not budgeted
    const lat = body?.lat;
    const lng = body?.lng;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      return status(400, "Bad Request");
    const lang = body?.lang === "en" ? "en" : "ja";
    const found = await reverseGeocode(env, { lat, lng }, lang);
    log.set({ geocoder: { reverse: true, ok: found !== null, found: found?.place != null } });
    if (found === null) return status(502, "Bad Gateway");
    return Response.json(found);
  }

  if (action === "places") {
    // the memo as it is being written; the places are named in the asker's language
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
    const text = typeof body?.body === "string" ? body.body.trim().slice(0, 4000) : "";
    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 20)
      : [];
    const lang = body?.lang === "en" ? "en" : "ja";
    if (title === "" && text === "") return status(400, "Bad Request");

    const context = await room.placeContext(memberId);
    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return status(429, `Budget: ${reserved.refused}`);
    }
    const named = await namePlace(env, context, { title, body: text, tags });
    if (!named.ok) {
      if (named.refund) await index.refund(reserved.id);
      log.set({
        claude: { model: MODEL, ok: false, refunded: named.refund, reason: named.reason },
      });
      return status(502, "Bad Gateway");
    }
    await room.recordAgentCall(memberId, "places", named.usage);

    // the best query first; the other only when the first finds nothing, a second later
    let places: Place[] = [];
    for (const [i, query] of named.value.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, SPACING_MS));
      const found = await geocode(env, query, lang);
      if (found === null) {
        log.set({
          claude: { model: MODEL, ok: true, tokens: named.usage },
          geocoder: { ok: false },
        });
        return status(502, "Bad Gateway");
      }
      places = found;
      if (places.length > 0) break;
    }
    log.set({
      claude: { model: MODEL, ok: true, tokens: named.usage, queries: named.value.length },
      geocoder: { ok: true, found: places.length },
    });
    return Response.json({ places });
  }

  if (action === "suggest") {
    // where the asker is looking on the desk: the cards land there
    const at = parsePoint(body?.at);
    if (at === null) return status(400, "Bad Request");
    const context = await room.contextForSuggest(memberId);
    log.set({ suggest: { notes: context.notes.length } });
    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return status(429, `Budget: ${reserved.refused}`);
    }
    const result = await suggestNotes(env, context);
    if (!result.ok) {
      if (result.refund) await index.refund(reserved.id);
      log.set({
        claude: { model: MODEL, ok: false, refunded: result.refund, reason: result.reason },
      });
      return status(502, "Bad Gateway");
    }
    await room.recordAgentCall(memberId, "suggest", result.usage);
    const added = await room.addSuggestions(memberId, result.value, at);
    log.set({ claude: { model: MODEL, ok: true, tokens: result.usage, items: added } });
    return Response.json({ added });
  }

  return people(action, { index, room, roomId, memberId, body });
}

/**
 * Who is in a room, and who is asked in: the owner invites, takes an invitation back, removes
 * someone and deletes the room; anyone else may leave. The room decides who may; the index
 * keeps the e-mails.
 */
async function people(
  action: Exclude<
    RoomAction,
    | "ws"
    | "draft"
    | "suggest"
    | "tags"
    | "candidates"
    | "places"
    | "where"
    | "expand"
    | "restore"
    | "purge"
  >,
  {
    index,
    room,
    roomId,
    memberId,
    body,
  }: {
    index: DurableObjectStub<RoomsIndex>;
    room: DurableObjectStub<Room>;
    roomId: string;
    memberId: string;
    body: Record<string, unknown> | null;
  },
): Promise<Response> {
  switch (action) {
    case "invited": {
      // the e-mails invited are the owner's to see: they typed them. Who owns the room and how
      // many it holds every member knows already, from the socket and the app.
      if ((await room.owner(memberId)) !== memberId) return status(403, "Forbidden");
      return Response.json({ invited: await index.invited(roomId) });
    }
    case "invite": {
      const invitee = parseEmail(body?.email);
      if (invitee === null) return status(400, "Bad Request");
      if ((await room.owner(memberId)) !== memberId) return status(403, "Forbidden");
      const seat = await room.openSeat(memberId);
      if (seat === null) return status(409, "Conflict"); // every seat taken or held
      if (!(await index.invite(invitee, roomId, seat))) {
        await room.closeSeat(seat);
        return status(409, "Conflict"); // already in, or already invited
      }
      return Response.json({ invited: invitee });
    }
    case "uninvite": {
      const invitee = parseEmail(body?.email);
      if (invitee === null) return status(400, "Bad Request");
      if ((await room.owner(memberId)) !== memberId) return status(403, "Forbidden");
      const seat = await index.take(invitee, roomId);
      if (seat === null) return status(404, "Not Found");
      await room.closeSeat(seat);
      return Response.json({});
    }
    case "remove":
    case "leave": {
      const member = action === "leave" ? memberId : body?.member;
      if (typeof member !== "string" || member === "") return status(400, "Bad Request");
      if (!(await room.remove(memberId, member))) return status(403, "Forbidden");
      await index.forget(roomId, member);
      return Response.json({});
    }
    case "delete": {
      if (!(await room.delete(memberId, roomId))) return status(403, "Forbidden");
      await index.mark(roomId, await room.deletedAt());
      return Response.json({});
    }
  }
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

/** Bytes as base64, in slices: a spread of a whole picture would overflow the call stack */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
