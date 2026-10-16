import { sValidator } from "@hono/standard-validator";
import { evlog, type EvlogVariables } from "evlog/hono";
import { initWorkersLogger } from "evlog/workers";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import * as v from "valibot";

import { AccessVerifier, Unauthenticated } from "./access";
import { ASK_LENGTH, draftDay, MODEL, namePlace, proposeTags, suggestNotes } from "./claude";
import { CLEF_MODEL, FITS_AT, judgeTags, MAX_TAGS } from "./clef";
import { expand, placeName } from "./expand";
import { geocode, reverseGeocode, SPACING_MS, type Place } from "./geocode";
import { preview } from "./preview";
import { bookletKey, Room } from "./room";
import { RoomsIndex } from "./rooms-index";
import {
  EmailSchema,
  type Email,
  isImageId,
  type ImageId,
  ImageIdSchema,
  isShortMapsLink,
  LatLngSchema,
  type MemberId,
  MemberIdSchema,
  NoteIdSchema,
  parseMapsUrl,
  roomId as toRoomId,
  type RoomId,
  RoomIdSchema,
} from "./types";
import {
  IMAGE_TYPES,
  IsoDateSchema,
  MAX_IMAGE_BYTES,
  NewTripSchema,
  PointSchema,
  ProfileSchema,
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
type ApiEnv = { Bindings: Env; Variables: EvlogVariables["Variables"] & { email: Email } };

/** The language the asker reads, English or else Japanese */
const lang = v.fallback(v.picklist(["ja", "en"]), "ja");
/** Words as written, cut to `max` */
const cut = (max: number) =>
  v.pipe(
    v.string(),
    v.transform((s) => s.slice(0, max)),
  );
/** And, in a room, which one and who the asker is in it */
type InRoom = {
  Bindings: Env;
  Variables: ApiEnv["Variables"] & {
    roomId: RoomId;
    memberId: MemberId;
    room: DurableObjectStub<Room>;
  };
};

/** A room's path; an id that is not a UUID is no room (`member` answers 404) */
const ROOM = "/rooms/:roomId";

/** Who Access says is asking; without a valid token nothing past here runs */
const identify = createMiddleware<ApiEnv>(async (c, next) => {
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
    const roomId = toRoomId(c.req.param("roomId"));
    if (roomId === null) return c.text("Not Found", 404);
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
const api = new Hono<ApiEnv>()
  .basePath("/api")
  // the app's files are not logged, only what the API decides
  .use(evlog({ redact: true }))
  .use(identify)

  .get(`${ROOM}/images/:imageId`, member("image"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const imageId = c.req.param("imageId");
    if (!isImageId(imageId) || !(await room.hasImageFor(memberId, imageId)))
      return c.text("Not Found", 404);
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
      const id = await room.addImage(memberId, roomId, type, data.byteLength);
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
    const glance = async (id: RoomId, by: MemberId | null = null) => ({
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
  .post("/invitations/:roomId/decline", async (c) => {
    const roomId = toRoomId(c.req.param("roomId"));
    if (roomId === null) return c.text("Not Found", 404);
    c.var.log.set({ room: roomId, action: "decline" });
    const seat = await c.env.ROOMS.getByName("index").take(c.var.email, roomId);
    if (seat === null) return c.text("Not Found", 404);
    await c.env.ROOM.getByName(roomId).closeSeat(seat);
    return c.json({});
  })
  // who they will be in the room is theirs to say, checked before the seat is taken
  .post("/invitations/:roomId/accept", body(ProfileSchema), async (c) => {
    const roomId = toRoomId(c.req.param("roomId"));
    if (roomId === null) return c.text("Not Found", 404);
    c.var.log.set({ room: roomId, action: "accept" });
    const me = c.req.valid("json");
    const index = c.env.ROOMS.getByName("index");
    const seat = await index.take(c.var.email, roomId);
    if (seat === null) return c.text("Not Found", 404);
    const room = c.env.ROOM.getByName(roomId);
    const accepted = await room.accept(seat, me);
    if (!accepted.ok) {
      c.var.log.set({ refused: accepted.reason });
      return c.text("Conflict", 409);
    }
    const memberId = accepted.member;
    const added = await index.add(c.var.email, roomId, memberId);
    if (!added.ok) {
      c.var.log.set({ refused: added.reason });
      // at the cap of rooms: the seat is lost, as a declined one would be
      await room.unaccept(memberId);
      return c.text("Conflict", 409);
    }
    c.var.log.set({ member: memberId });
    return c.json({ memberId });
  })

  .post("/rooms", body(v.object({ trip: NewTripSchema, me: ProfileSchema })), async (c) => {
    const { trip, me } = c.req.valid("json");
    const roomId = v.parse(RoomIdSchema, crypto.randomUUID());
    const memberId = await c.env.ROOM.getByName(roomId).create(trip, me);
    const added = await c.env.ROOMS.getByName("index").add(c.var.email, roomId, memberId);
    if (!added.ok) {
      c.var.log.set({ refused: added.reason });
      return c.text("Conflict", 409);
    }
    return c.json({ roomId, memberId });
  })

  // a deleted room resolves nobody, but the people who were in it may take the deletion
  // back, and its owner may have it gone for good at once (the room drops itself from the index)
  .post(`${ROOM}/restore`, member("restore", true), async (c) => {
    const { roomId, memberId, room } = c.var;
    const restored = await room.restore(memberId);
    if (!restored.ok) {
      c.var.log.set({ refused: restored.reason });
      return c.text("Forbidden", 403);
    }
    await c.env.ROOMS.getByName("index").mark(roomId, null);
    return c.json({});
  })
  .post(`${ROOM}/purge`, member("purge", true), async (c) => {
    const purged = await c.var.room.purge(c.var.memberId);
    if (!purged.ok) {
      c.var.log.set({ refused: purged.reason });
      return c.text("Forbidden", 403);
    }
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

  .post(`${ROOM}/draft`, member("draft"), body(v.object({ date: IsoDateSchema })), async (c) => {
    const { email, log, roomId, memberId, room } = c.var;
    const { date } = c.req.valid("json");
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

  // the memo as it is being written: its words, the tags it has, and its picture
  .post(
    `${ROOM}/tags`,
    member("tags"),
    body(
      v.object({
        title: cut(200),
        body: v.fallback(cut(4000), ""),
        chosen: v.optional(v.array(v.string()), []),
        image: v.optional(v.nullable(ImageIdSchema), null),
      }),
    ),
    async (c) => {
      const { email, log, roomId, memberId, room } = c.var;
      const { title, body: text, chosen, image: imageId } = c.req.valid("json");

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
    },
  )

  // the trip's candidate tags, for the form to rank as the words are typed: free, so not budgeted
  .post(`${ROOM}/candidates`, member("candidates"), async (c) => {
    const { candidates } = await c.var.room.tagContext(c.var.memberId);
    return c.json({ tags: candidates });
  })

  // a short Google Maps link, expanded by reading its one redirect; anything else is answered
  // as it came, without a fetch. A fetch of a URL a person typed counts against their budget
  .post(
    `${ROOM}/expand`,
    member("expand"),
    body(v.object({ url: v.pipe(v.string(), v.maxLength(2000)), lang })),
    async (c) => {
      const { email, log, roomId } = c.var;
      const { url, lang } = c.req.valid("json");
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
        const found = await geocode(c.env, name, lang);
        const first = found?.[0];
        if (first !== undefined) at = { lat: first.lat, lng: first.lng };
      }
      // the shape it led to, not the place: enough to tell which way a link that found nothing went
      const shape =
        expanded === null
          ? null
          : (/\/maps\/(\w+)/.exec(new URL(expanded).pathname)?.[1] ?? "root");
      log.set({
        expand: { ok: expanded !== null, shape, point: point !== null, named: name !== null },
        geocoder: { ok: name === null || at !== null },
      });
      return c.json({ url: expanded ?? url, at });
    },
  )

  // what a page a note links to says of itself (preview.ts): its title, a line and its picture,
  // which the room keeps as one of its pictures. The Worker fetches a page the member pasted,
  // so it is fenced there and budgeted here (docs/auth-and-security.md, "Previewing links")
  .post(
    `${ROOM}/preview`,
    member("preview"),
    body(v.object({ url: v.pipe(v.string(), v.trim(), v.maxLength(2000)) })),
    async (c) => {
      const { email, log, roomId, memberId, room } = c.var;
      const { url } = c.req.valid("json");
      const index = c.env.ROOMS.getByName("index");
      const reserved = await index.reserve(email, roomId);
      if ("refused" in reserved) {
        log.set({ budget: { refused: reserved.refused } });
        return c.text(`Budget: ${reserved.refused}`, 429);
      }
      const found = await preview(
        url,
        [c.env.APP_HOST, c.env.BOOKLET_HOST],
        c.env.PREVIEW_BASE_URL,
      );
      // the site it was on, never the address: enough to tell which kinds of pages say nothing
      log.set({
        preview: { ok: found !== null, site: found?.site ?? null, picture: found?.image !== null },
      });
      if (found === null) return c.json({ preview: null });
      let image: ImageId | null = null;
      if (found.image !== null) {
        const { bytes, type } = found.image;
        const id = await room.addImage(memberId, roomId, type, bytes.byteLength);
        if (id !== null) {
          try {
            await c.env.IMAGES.put(imageKey(roomId, id), bytes, {
              httpMetadata: { contentType: type },
            });
            image = id;
          } catch {
            await room.dropImage(id);
          }
        }
      }
      const { title, description, site } = found;
      return c.json({ preview: { url: found.url, site, title, description, image } });
    },
  )

  // places by a name the asker typed (a stay's): OpenStreetMap only, free (no agent), so not budgeted
  .post(
    `${ROOM}/find`,
    member("find"),
    body(v.object({ query: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(200)), lang })),
    async (c) => {
      const { query, lang } = c.req.valid("json");
      const found = await geocode(c.env, query, lang);
      c.var.log.set({ geocoder: { ok: found !== null, found: found?.length ?? 0 } });
      if (found === null) return c.text("Bad Gateway", 502);
      return c.json({ places: found });
    },
  )

  // what is at a point the asker pinned on the map: free (no agent), so not budgeted
  .post(
    `${ROOM}/where`,
    member("where"),
    body(v.object({ ...LatLngSchema.entries, lang })),
    async (c) => {
      const { lat, lng, lang } = c.req.valid("json");
      const found = await reverseGeocode(c.env, { lat, lng }, lang);
      c.var.log.set({
        geocoder: { reverse: true, ok: found !== null, found: found?.place != null },
      });
      if (found === null) return c.text("Bad Gateway", 502);
      return c.json(found);
    },
  )

  // the memo as it is being written; the places are named in the asker's language
  .post(
    `${ROOM}/places`,
    member("places"),
    body(
      v.pipe(
        v.object({
          title: v.fallback(v.pipe(v.string(), v.trim(), cut(200)), ""),
          body: v.fallback(v.pipe(v.string(), v.trim(), cut(4000)), ""),
          tags: v.pipe(
            v.optional(v.array(v.string()), []),
            v.transform((tags) => tags.slice(0, 20)),
          ),
          lang,
        }),
        // a memo with no words names no place
        v.check(({ title, body }) => title !== "" || body !== ""),
      ),
    ),
    async (c) => {
      const { email, log, roomId, memberId, room } = c.var;
      const { title, body: text, tags, lang } = c.req.valid("json");

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
    },
  )

  // where the cards land on the desk (where the asker is looking, or beside the note asked
  // from), and what the asker asked for: their words, the note they started from, or neither
  .post(
    `${ROOM}/suggest`,
    member("suggest"),
    body(
      v.object({
        at: PointSchema,
        // their words, if they wrote any
        ask: v.fallback(
          v.pipe(
            v.string(),
            v.trim(),
            cut(ASK_LENGTH),
            v.transform((ask) => (ask === "" ? null : ask)),
          ),
          null,
        ),
        about: v.optional(v.nullable(NoteIdSchema), null),
      }),
    ),
    async (c) => {
      const { email, log, roomId, memberId, room } = c.var;
      const { at, ask, about } = c.req.valid("json");
      const context = await room.contextForSuggest(memberId, about);
      // the note asked from is gone (deleted on the other phone): nothing is called
      if (context === null) return c.text("Not Found", 404);
      log.set({
        suggest: { notes: context.notes.length, ask: ask !== null, about: about !== null },
      });
      const index = c.env.ROOMS.getByName("index");
      const reserved = await index.reserve(email, roomId);
      if ("refused" in reserved) {
        log.set({ budget: { refused: reserved.refused } });
        return c.text(`Budget: ${reserved.refused}`, 429);
      }
      const result = await suggestNotes(c.env, context, ask);
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
    },
  )

  // The booklet as a public page (docs/auth-and-security.md): every member sees whether it is
  // up and its link; only the owner puts it up (again, under a new link) or takes it down.
  .post(`${ROOM}/publication`, member("publication"), async (c) => {
    const p = await c.var.room.publication(c.var.memberId);
    return c.json({
      publication: p === null ? null : { url: bookletUrl(c.env, p.slug), at: p.at },
    });
  })
  .post(`${ROOM}/publish`, member("publish"), body(v.object({ lang })), async (c) => {
    const { email, log, roomId, memberId, room } = c.var;
    // refused before the budget is touched
    if ((await room.owner(memberId)) !== memberId) return c.text("Forbidden", 403);
    // each publish writes to R2 at a rate the member chooses, so it counts like a paid call
    const index = c.env.ROOMS.getByName("index");
    const reserved = await index.reserve(email, roomId);
    if ("refused" in reserved) {
      log.set({ budget: { refused: reserved.refused } });
      return c.text(`Budget: ${reserved.refused}`, 429);
    }
    let published: Awaited<ReturnType<Room["publish"]>>;
    try {
      published = await room.publish(memberId, c.req.valid("json").lang);
    } catch (e) {
      await index.refund(reserved.id);
      throw e;
    }
    if (!published.ok) {
      await index.refund(reserved.id);
      return c.text("Forbidden", 403);
    }
    log.set({ publish: { at: published.at } });
    return c.json({ publication: { url: bookletUrl(c.env, published.slug), at: published.at } });
  })
  .post(`${ROOM}/withdraw`, member("withdraw"), async (c) => {
    const out = await c.var.room.withdraw(c.var.memberId);
    if (!out.ok) {
      c.var.log.set({ refused: out.reason });
      return c.text("Forbidden", 403);
    }
    return c.json({});
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
  .post(`${ROOM}/invite`, member("invite"), body(v.object({ email: EmailSchema })), async (c) => {
    const { roomId, memberId, room } = c.var;
    const { email: invitee } = c.req.valid("json");
    if ((await room.owner(memberId)) !== memberId) return c.text("Forbidden", 403);
    const held = await room.openSeat(memberId);
    if (!held.ok) {
      c.var.log.set({ refused: held.reason });
      return c.text("Conflict", 409);
    }
    const { seat } = held;
    const invited = await c.env.ROOMS.getByName("index").invite(invitee, roomId, seat);
    if (!invited.ok) {
      await room.closeSeat(seat);
      c.var.log.set({ refused: invited.reason });
      return c.text("Conflict", 409);
    }
    return c.json({ invited: invitee });
  })
  .post(
    `${ROOM}/uninvite`,
    member("uninvite"),
    body(v.object({ email: EmailSchema })),
    async (c) => {
      const { roomId, memberId, room } = c.var;
      const { email: invitee } = c.req.valid("json");
      if ((await room.owner(memberId)) !== memberId) return c.text("Forbidden", 403);
      const seat = await c.env.ROOMS.getByName("index").take(invitee, roomId);
      if (seat === null) return c.text("Not Found", 404);
      await room.closeSeat(seat);
      return c.json({});
    },
  )
  .post(
    `${ROOM}/remove`,
    member("remove"),
    body(v.object({ member: MemberIdSchema })),
    async (c) => {
      const { roomId, memberId, room } = c.var;
      const { member: removed } = c.req.valid("json");
      const out = await room.remove(memberId, removed);
      if (!out.ok) {
        c.var.log.set({ refused: out.reason });
        return c.text("Forbidden", 403);
      }
      await c.env.ROOMS.getByName("index").forget(roomId, removed);
      return c.json({});
    },
  )
  .post(`${ROOM}/leave`, member("leave"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const out = await room.remove(memberId, memberId);
    if (!out.ok) {
      c.var.log.set({ refused: out.reason });
      return c.text("Forbidden", 403);
    }
    await c.env.ROOMS.getByName("index").forget(roomId, memberId);
    return c.json({});
  })
  .post(`${ROOM}/delete`, member("delete"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const deleted = await room.delete(memberId, roomId);
    if (!deleted.ok) {
      c.var.log.set({ refused: deleted.reason });
      return c.text("Forbidden", 403);
    }
    await c.env.ROOMS.getByName("index").mark(roomId, await room.deletedAt());
    return c.json({});
  })

  // anything else under /api is no call, and never the app's files
  .all("*", (c) => c.text("Not Found", 404));

/** The API's routes, for the app's client (hc) */
export type Api = typeof api;

export default new Hono<{ Bindings: Env }>()
  .use(async (c, next) => {
    const host = new URL(c.req.url).host;
    if (host === c.env.BOOKLET_HOST) return booklet(c.env, c.req.raw);
    // `wrangler dev` presents requests under the first custom domain, so this holds locally too
    if (host !== c.env.APP_HOST) return c.text("Not Found", 404);
    await next();
  })
  .route("/", api)
  .all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

/** A published booklet's public address */
const bookletUrl = (env: Env, slug: string) => `https://${env.BOOKLET_HOST}/r/${slug}/shiori`;

/** A slug as newSlug() makes one; anything else is no booklet, and R2 is not asked */
const SLUG = /^[A-Za-z0-9_-]{22}$/;

/** What every answer on the public host says: not for search engines, not for sniffing */
const PUBLIC_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/**
 * Published booklets only (docs/auth-and-security.md). Nothing here is behind Access, so
 * nothing here may cost anything: a file read from R2, or nothing. The page has no script, and
 * its CSP allows none, nor anything fetched; its style is its own, inline.
 */
async function booklet(env: Env, req: Request): Promise<Response> {
  const notFound = () =>
    new Response("Not Found", {
      status: 404,
      headers: { ...PUBLIC_HEADERS, "Content-Type": "text/plain" },
    });
  if (req.method !== "GET" && req.method !== "HEAD") return notFound();
  const { pathname } = new URL(req.url);
  if (pathname === "/robots.txt")
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { ...PUBLIC_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  const slug = /^\/r\/([^/]+)\/shiori$/.exec(pathname)?.[1];
  if (slug === undefined || !SLUG.test(slug)) return notFound();
  const object = await env.IMAGES.get(bookletKey(slug));
  if (object === null) return notFound();
  return new Response(req.method === "HEAD" ? null : object.body, {
    headers: {
      ...PUBLIC_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      // a withdrawn or replaced booklet is gone from caches within the minute
      "Cache-Control": "public, max-age=60",
    },
  });
}

/** The room's own folder in the bucket: one room's ids never reach another's pictures */
const imageKey = (roomId: RoomId, id: ImageId) => `rooms/${roomId}/images/${id}`;

/**
 * The JSON body as `schema` reads it, or 400. The app's client (hc) sends the schema's input;
 * the handler has its output, the brands it checked
 */
function body<S extends v.GenericSchema>(schema: S) {
  return sValidator("json", schema, (result, c) =>
    result.success ? undefined : c.text("Bad Request", 400),
  );
}

/** Bytes as base64, in slices: a spread of a whole picture would overflow the call stack */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
