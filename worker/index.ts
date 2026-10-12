import { evlog, type EvlogVariables } from "evlog/hono";
import { initWorkersLogger } from "evlog/workers";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { isRecord } from "../src/app/shared/record";

import { isImageId } from "../src/app/features/notes/id";
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

/** What the API's handlers have: the bindings, the request's log, and who Access says is asking */
type Api = { Bindings: Env; Variables: EvlogVariables["Variables"] & { email: string } };
/** And, in a room, which one and who the asker is in it */
type InRoom = {
  Bindings: Env;
  Variables: Api["Variables"] & {
    roomId: string;
    memberId: string;
    room: DurableObjectStub<Room>;
  };
};

/** A room's path; its id is a UUID, and anything else is not a room */
const ROOM = "/rooms/:roomId{[0-9a-f-]{36}}";

/** Who Access says is asking; without a valid token nothing past here runs */
const identify = createMiddleware<Api>(async (c, next) => {
  try {
    c.set("email", await access(c.env).identify(c.req.raw));
  } catch (e) {
    if (!(e instanceof Unauthenticated)) throw e;
    c.var.log.set({ auth: { refused: e.message } });
    return c.text("Unauthorized", 401);
  }
  await next();
});

/**
 * The asker as a member of the room in the path (or, `deleted`, of the room as it was), logged
 * with what they asked for
 */
const member = (action: string, deleted = false) =>
  createMiddleware<InRoom>(async (c, next) => {
    const roomId = c.req.param("roomId");
    if (roomId === undefined) return c.text("Not Found", 404);
    const memberId = await c.env.ROOMS.getByName("index").resolve(c.var.email, roomId, deleted);
    if (memberId === null) return c.text("Forbidden", 403);
    c.var.log.set({ room: roomId, member: memberId, action });
    c.set("roomId", roomId);
    c.set("memberId", memberId);
    c.set("room", c.env.ROOM.getByName(roomId));
    await next();
  });

/**
 * The API, under Access. Pictures come first: a GET comes from an <img>, which sends no Origin
 * and no JSON; it only reads, so it passes with Access's identity and the membership alone.
 * Everything after the gate below is a POST with JSON from the app's origin, or the socket's
 * upgrade.
 */
const api = new Hono<Api>()
  .basePath("/api")
  // the app's files are not logged, only what the API decides
  .use(evlog({ redact: true }))
  .use(identify)

  .get(`${ROOM}/images/:imageId{[0-9a-f-]{36}}`, member("image"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const imageId = c.req.param("imageId");
    if (!(await room.hasImageFor(memberId, imageId))) return c.text("Not Found", 404);
    const object = await c.env.IMAGES.get(imageKey(roomId, imageId));
    if (object === null) return c.text("Not Found", 404);
    return c.body(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        // an id is never reused for other bytes; only this person's browser keeps it
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })

  // an upload is a POST of the picture's bytes and must come from the app's origin, like any
  // call that changes something
  .post(
    `${ROOM}/images`,
    async (c, next) => {
      if (c.req.header("Origin") !== new URL(c.req.url).origin) return c.text("Forbidden", 403);
      await next();
    },
    member("image"),
    async (c) => {
      const { roomId, memberId, room } = c.var;
      const type = c.req.header("Content-Type") ?? "";
      if (!IMAGE_TYPES.some((t) => t === type)) return c.text("Unsupported Media Type", 415);
      if (Number(c.req.header("Content-Length") ?? "0") > MAX_IMAGE_BYTES)
        return c.text("Payload Too Large", 413);
      const data = await c.req.arrayBuffer();
      if (data.byteLength === 0) return c.text("Bad Request", 400);
      if (data.byteLength > MAX_IMAGE_BYTES) return c.text("Payload Too Large", 413);
      // the room's list first, so its cap holds; the bytes after, and the entry goes if they fail
      const id = await room.addImage(memberId, type, data.byteLength);
      c.var.log.set({ image: { type, bytes: data.byteLength, stored: id !== null } });
      if (id === null) return c.text("Conflict", 409);
      try {
        await c.env.IMAGES.put(imageKey(roomId, id), data, { httpMetadata: { contentType: type } });
      } catch (e) {
        await room.dropImage(id);
        throw e;
      }
      return c.json({ id });
    },
  )

  // Access checks the cookie, not where the request came from. Every API call is a POST with
  // JSON (so the browser always sends Origin) or the socket's upgrade, a GET; anything else is
  // refused.
  .use(async (c, next) => {
    if (c.req.header("Origin") !== new URL(c.req.url).origin) return c.text("Forbidden", 403);
    const upgrade = c.req.header("Upgrade") === "websocket";
    if (
      upgrade
        ? c.req.method !== "GET"
        : c.req.method !== "POST" || c.req.header("Content-Type") !== "application/json"
    )
      return c.text("Forbidden", 403);
    await next();
  })

  .post("/me", async (c) => {
    const { email } = c.var;
    const index = c.env.ROOMS.getByName("index");
    const [mine, invitedTo, deletedIds] = await Promise.all([
      index.memberships(email),
      index.invitations(email),
      index.rooms(email, true),
    ]);
    // each at a glance, and whether the asker made it (and so may delete it from the list)
    const glance = async (id: string, by: string | null = null) => ({
      id,
      ...(await c.env.ROOM.getByName(id).summary(by)),
    });
    const rooms = await Promise.all(mine.map((m) => glance(m.roomId, m.memberId)));
    // an invitation shows the trip it is to, its owner leading the members
    const invitations = await Promise.all(invitedTo.map((id) => glance(id)));
    // a deleted trip, to the people who were in it, who may restore it
    const deleted = (
      await Promise.all(
        deletedIds.map(async (id) => {
          const by = await index.resolve(email, id, true);
          const d = by === null ? null : await c.env.ROOM.getByName(id).deletedFor(by);
          return d === null ? [] : [{ id, ...d }];
        }),
      )
    ).flat();
    return c.json({ rooms, invitations, deleted });
  })

  // An invitation to a room, answered by the person invited
  .post("/invitations/:roomId{[0-9a-f-]{36}}/decline", async (c) => {
    const roomId = c.req.param("roomId");
    c.var.log.set({ room: roomId, action: "decline" });
    const seat = await c.env.ROOMS.getByName("index").take(c.var.email, roomId);
    if (seat === null) return c.text("Not Found", 404);
    await c.env.ROOM.getByName(roomId).closeSeat(seat);
    return c.json({});
  })
  .post("/invitations/:roomId{[0-9a-f-]{36}}/accept", async (c) => {
    const roomId = c.req.param("roomId");
    c.var.log.set({ room: roomId, action: "accept" });
    // who they will be in the room is theirs to say, checked before the seat is taken
    const me = parseProfile(await json(c.req.raw));
    if (me === null) return c.text("Bad Request", 400);
    const index = c.env.ROOMS.getByName("index");
    const seat = await index.take(c.var.email, roomId);
    if (seat === null) return c.text("Not Found", 404);
    const room = c.env.ROOM.getByName(roomId);
    const memberId = await room.accept(seat, me);
    if (memberId === null) return c.text("Conflict", 409);
    if (!(await index.add(c.var.email, roomId, memberId))) {
      // at the cap of rooms: the seat is lost, as a declined one would be
      await room.unaccept(memberId);
      return c.text("Conflict", 409);
    }
    c.var.log.set({ member: memberId });
    return c.json({ memberId });
  })

  .post("/rooms", async (c) => {
    const body = await json(c.req.raw);
    const trip = parseTrip(body?.trip);
    const me = parseProfile(body?.me);
    if (trip === null || me === null) return c.text("Bad Request", 400);
    const roomId = crypto.randomUUID();
    const memberId = await c.env.ROOM.getByName(roomId).create(trip, me);
    if (!(await c.env.ROOMS.getByName("index").add(c.var.email, roomId, memberId)))
      return c.text("Conflict", 409);
    return c.json({ roomId, memberId });
  })

  // a deleted room resolves nobody, but the people who were in it may take the deletion
  // back, and its owner may have it gone for good at once (the room drops itself from the index)
  .post(`${ROOM}/restore`, member("restore", true), async (c) => {
    const { roomId, memberId, room } = c.var;
    if (!(await room.restore(memberId))) return c.text("Forbidden", 403);
    await c.env.ROOMS.getByName("index").mark(roomId, null);
    return c.json({});
  })
  .post(`${ROOM}/purge`, member("purge", true), async (c) => {
    if (!(await c.var.room.purge(c.var.memberId))) return c.text("Forbidden", 403);
    return c.json({});
  })

  .get(`${ROOM}/ws`, member("ws"), async (c) => {
    if (c.req.header("Upgrade") !== "websocket") return c.text("Forbidden", 403);
    // Only the upgrade goes through fetch, with the resolved member in a header of our own
    return await c.var.room.fetch(
      new Request(c.req.url, {
        headers: { Upgrade: "websocket", [Room.MEMBER_HEADER]: c.var.memberId },
      }),
    );
  })

  .post(`${ROOM}/draft`, member("draft"), async (c) => {
    const { email, log, roomId, memberId, room } = c.var;
    const date = (await json(c.req.raw))?.date;
    if (!isDate(date)) return c.text("Bad Request", 400);
    const day = await room.dayForDraft(memberId, date);
    if (day === null) return c.text("Bad Request", 400);
    log.set({ draft: { date, notes: day.notes.length } });
    // reserve, call, settle (docs/auth-and-security.md): nothing is called past the budget
    const index = c.env.ROOMS.getByName("index");
    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return c.text(`Budget: ${reserved.refused}`, 429);
    }
    const result = await draftDay(c.env, { ...day, date });
    if (!result.ok) {
      if (result.refund) await index.refund(reserved.id);
      log.set({
        claude: { model: MODEL, ok: false, refunded: result.refund, reason: result.reason },
      });
      return c.text("Bad Gateway", 502);
    }
    await room.recordAgentCall(memberId, "draft", result.usage);
    log.set({
      claude: { model: MODEL, ok: true, tokens: result.usage, items: result.value.items.length },
    });
    return c.json({ by: Room.AGENT_ID, ...result.value });
  })

  .post(`${ROOM}/tags`, member("tags"), async (c) => {
    const { email, log, roomId, memberId, room } = c.var;
    const body = await json(c.req.raw);
    // the memo as it is being written: its words, the tags it has, and its picture
    const title = typeof body?.title === "string" ? body.title.slice(0, 200) : null;
    const text = typeof body?.body === "string" ? body.body.slice(0, 4000) : "";
    const chosen = Array.isArray(body?.chosen)
      ? body.chosen.filter((t): t is string => typeof t === "string")
      : [];
    const imageId = body?.image ?? null;
    if (title === null || !(imageId === null || isImageId(imageId)))
      return c.text("Bad Request", 400);

    const index = c.env.ROOMS.getByName("index");
    const context = await room.tagContext(memberId);
    let candidates = context.candidates;
    // the trip's candidates, once: Claude proposes them the first time anyone asks
    if (candidates.length === 0) {
      const reserved = await index.reserve(email, roomId);
      if ("refused" in reserved) {
        log.set({ budget: { refused: reserved.refused } });
        return c.text(`Budget: ${reserved.refused}`, 429);
      }
      const proposed = await proposeTags(c.env, context);
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
    if (vocabulary.length === 0) return c.json({ tags: [] });

    // the picture goes along: Clef looks at it with the words
    let image: { type: string; base64: string } | null = null;
    if (imageId !== null && (await room.hasImageFor(memberId, imageId))) {
      const object = await c.env.IMAGES.get(imageKey(roomId, imageId));
      if (object !== null)
        image = {
          type: object.httpMetadata?.contentType ?? "image/webp",
          base64: toBase64(await object.arrayBuffer()),
        };
    }

    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return c.text(`Budget: ${reserved.refused}`, 429);
    }
    const judged = await judgeTags(c.env, { title, body: text, image }, vocabulary);
    if (!judged.ok) {
      if (judged.refund) await index.refund(reserved.id);
      log.set({
        clef: { model: CLEF_MODEL, ok: false, refunded: judged.refund, reason: judged.reason },
      });
      return c.text("Bad Gateway", 502);
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
    return c.json({
      tags: judged.tags.map((t) => ({ tag: t.tag, p: t.p, isNew: !inUse.has(t.tag) })),
    });
  })

  // the trip's candidate tags, for the form to rank as the words are typed: free, so not budgeted
  .post(`${ROOM}/candidates`, member("candidates"), async (c) => {
    const { candidates } = await c.var.room.tagContext(c.var.memberId);
    return c.json({ tags: candidates });
  })

  // a short Google Maps link, expanded by reading its one redirect; anything else is answered
  // as it came, without a fetch. A fetch of a URL a person typed counts against their budget
  .post(`${ROOM}/expand`, member("expand"), async (c) => {
    const { email, log, roomId } = c.var;
    const body = await json(c.req.raw);
    const url = body?.url;
    if (typeof url !== "string" || url.length > 2000) return c.text("Bad Request", 400);
    if (!isShortMapsLink(url)) return c.json({ url, at: null });
    const reserved = await c.env.ROOMS.getByName("index").reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return c.text(`Budget: ${reserved.refused}`, 429);
    }
    const expanded = await expand(url, c.env.SHORTLINK_BASE_URL);
    // a short link most often leads to the place's name (`/maps/place/<name>/data=…`, or
    // `?q=<name>`), not its point: then OpenStreetMap finds the name, free, and its point is the link's
    let at: { lat: number; lng: number } | null = null;
    const point = expanded === null ? null : parseMapsUrl(expanded);
    const name = expanded === null || point !== null ? null : placeName(expanded);
    if (name !== null) {
      const found = await geocode(c.env, name, body?.lang === "en" ? "en" : "ja");
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
    return c.json({ url: expanded ?? url, at });
  })

  // places by a name the asker typed (a stay's): OpenStreetMap only, free (no agent), so not budgeted
  .post(`${ROOM}/find`, member("find"), async (c) => {
    const body = await json(c.req.raw);
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (query === "" || query.length > 200) return c.text("Bad Request", 400);
    const found = await geocode(c.env, query, body?.lang === "en" ? "en" : "ja");
    c.var.log.set({ geocoder: { ok: found !== null, found: found?.length ?? 0 } });
    if (found === null) return c.text("Bad Gateway", 502);
    return c.json({ places: found });
  })

  // what is at a point the asker pinned on the map: free (no agent), so not budgeted
  .post(`${ROOM}/where`, member("where"), async (c) => {
    const body = await json(c.req.raw);
    const lat = body?.lat;
    const lng = body?.lng;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      return c.text("Bad Request", 400);
    const lang = body?.lang === "en" ? "en" : "ja";
    const found = await reverseGeocode(c.env, { lat, lng }, lang);
    c.var.log.set({ geocoder: { reverse: true, ok: found !== null, found: found?.place != null } });
    if (found === null) return c.text("Bad Gateway", 502);
    return c.json(found);
  })

  // the memo as it is being written; the places are named in the asker's language
  .post(`${ROOM}/places`, member("places"), async (c) => {
    const { email, log, roomId, memberId, room } = c.var;
    const body = await json(c.req.raw);
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
    const text = typeof body?.body === "string" ? body.body.trim().slice(0, 4000) : "";
    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 20)
      : [];
    const lang = body?.lang === "en" ? "en" : "ja";
    if (title === "" && text === "") return c.text("Bad Request", 400);

    const index = c.env.ROOMS.getByName("index");
    const context = await room.placeContext(memberId);
    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return c.text(`Budget: ${reserved.refused}`, 429);
    }
    const named = await namePlace(c.env, context, { title, body: text, tags });
    if (!named.ok) {
      if (named.refund) await index.refund(reserved.id);
      log.set({
        claude: { model: MODEL, ok: false, refunded: named.refund, reason: named.reason },
      });
      return c.text("Bad Gateway", 502);
    }
    await room.recordAgentCall(memberId, "places", named.usage);

    // the best query first; the other only when the first finds nothing, a second later
    let places: Place[] = [];
    for (const [i, query] of named.value.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, SPACING_MS));
      const found = await geocode(c.env, query, lang);
      if (found === null) {
        log.set({
          claude: { model: MODEL, ok: true, tokens: named.usage },
          geocoder: { ok: false },
        });
        return c.text("Bad Gateway", 502);
      }
      places = found;
      if (places.length > 0) break;
    }
    log.set({
      claude: { model: MODEL, ok: true, tokens: named.usage, queries: named.value.length },
      geocoder: { ok: true, found: places.length },
    });
    return c.json({ places });
  })

  // where the asker is looking on the desk: the cards land there
  .post(`${ROOM}/suggest`, member("suggest"), async (c) => {
    const { email, log, roomId, memberId, room } = c.var;
    const at = parsePoint((await json(c.req.raw))?.at);
    if (at === null) return c.text("Bad Request", 400);
    const context = await room.contextForSuggest(memberId);
    log.set({ suggest: { notes: context.notes.length } });
    const index = c.env.ROOMS.getByName("index");
    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return c.text(`Budget: ${reserved.refused}`, 429);
    }
    const result = await suggestNotes(c.env, context);
    if (!result.ok) {
      if (result.refund) await index.refund(reserved.id);
      log.set({
        claude: { model: MODEL, ok: false, refunded: result.refund, reason: result.reason },
      });
      return c.text("Bad Gateway", 502);
    }
    await room.recordAgentCall(memberId, "suggest", result.usage);
    const added = await room.addSuggestions(memberId, result.value, at);
    log.set({ claude: { model: MODEL, ok: true, tokens: result.usage, items: added } });
    return c.json({ added });
  })

  // Who is in a room, and who is asked in: the owner invites, takes an invitation back, removes
  // someone and deletes the room; anyone else may leave. The room decides who may; the index
  // keeps the e-mails.

  // the e-mails invited are the owner's to see: they typed them. Who owns the room and how
  // many it holds every member knows already, from the socket and the app.
  .post(`${ROOM}/invited`, member("invited"), async (c) => {
    const { roomId, memberId, room } = c.var;
    if ((await room.owner(memberId)) !== memberId) return c.text("Forbidden", 403);
    return c.json({ invited: await c.env.ROOMS.getByName("index").invited(roomId) });
  })
  .post(`${ROOM}/invite`, member("invite"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const invitee = parseEmail((await json(c.req.raw))?.email);
    if (invitee === null) return c.text("Bad Request", 400);
    if ((await room.owner(memberId)) !== memberId) return c.text("Forbidden", 403);
    const seat = await room.openSeat(memberId);
    if (seat === null) return c.text("Conflict", 409); // every seat taken or held
    if (!(await c.env.ROOMS.getByName("index").invite(invitee, roomId, seat))) {
      await room.closeSeat(seat);
      return c.text("Conflict", 409); // already in, or already invited
    }
    return c.json({ invited: invitee });
  })
  .post(`${ROOM}/uninvite`, member("uninvite"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const invitee = parseEmail((await json(c.req.raw))?.email);
    if (invitee === null) return c.text("Bad Request", 400);
    if ((await room.owner(memberId)) !== memberId) return c.text("Forbidden", 403);
    const seat = await c.env.ROOMS.getByName("index").take(invitee, roomId);
    if (seat === null) return c.text("Not Found", 404);
    await room.closeSeat(seat);
    return c.json({});
  })
  .post(`${ROOM}/remove`, member("remove"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const removed = (await json(c.req.raw))?.member;
    if (typeof removed !== "string" || removed === "") return c.text("Bad Request", 400);
    if (!(await room.remove(memberId, removed))) return c.text("Forbidden", 403);
    await c.env.ROOMS.getByName("index").forget(roomId, removed);
    return c.json({});
  })
  .post(`${ROOM}/leave`, member("leave"), async (c) => {
    const { roomId, memberId, room } = c.var;
    if (!(await room.remove(memberId, memberId))) return c.text("Forbidden", 403);
    await c.env.ROOMS.getByName("index").forget(roomId, memberId);
    return c.json({});
  })
  .post(`${ROOM}/delete`, member("delete"), async (c) => {
    const { roomId, memberId, room } = c.var;
    if (!(await room.delete(memberId, roomId))) return c.text("Forbidden", 403);
    await c.env.ROOMS.getByName("index").mark(roomId, await room.deletedAt());
    return c.json({});
  })

  // anything else under /api is no call, and never the app's files
  .all("*", (c) => c.text("Not Found", 404));

export default new Hono<{ Bindings: Env }>()
  .use(async (c, next) => {
    const host = new URL(c.req.url).host;
    if (host === c.env.BOOKLET_HOST) return booklet();
    // `wrangler dev` presents requests under the first custom domain, so this holds locally too
    if (host !== c.env.APP_HOST) return c.text("Not Found", 404);
    await next();
  })
  .route("/", api)
  .all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

/** Published booklets only; nothing here is behind Access, so nothing here may cost anything */
const booklet = () => new Response("Not Found", { status: 404 });

/** The room's own folder in the bucket: one room's ids never reach another's pictures */
const imageKey = (roomId: string, id: string) => `rooms/${roomId}/images/${id}`;

/** The JSON body as a record, or null when it is not one */
async function json(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await request.json();
    return isRecord(v) ? v : null;
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
