import { sValidator } from "@hono/standard-validator";
import { evlog, type EvlogVariables } from "evlog/hono";
import { initWorkersLogger } from "evlog/workers";
import { Hono, type Context, type Next } from "hono";
import { createMiddleware } from "hono/factory";
import * as v from "valibot";

import { EmailSchema, type Email, type Result } from "../contract";
import { type ImageId, ImageIdSchema } from "../contract/image";
import { type MemberId, MemberIdSchema } from "../contract/member";
import { NoteIdSchema } from "../contract/note";
import {
  type HttpUrl,
  HttpUrlSchema,
  isShortMapsLink,
  LatLngSchema,
  type LatLng,
  parseHttpUrl,
  parseMapsUrl,
} from "../contract/place";
import { parseTag, type RoomId, RoomIdSchema } from "../contract/room";
import {
  parseImageType,
  IsoDateSchema,
  LangSchema,
  MAX_IMAGE_BYTES,
  NewTripSchema,
  PointSchema,
  ProfileSchema,
} from "../contract/wire";

import { AccessVerifier, Unauthenticated } from "./access";
import {
  ASK_LENGTH,
  type ClaudeResult,
  draftDay,
  MODEL,
  namePlace,
  proposeTags,
  suggestNotes,
} from "./claude";
import { CLEF_MODEL, type ClefResult, FITS_AT, judgeTags, MAX_TAGS, type MemoToTag } from "./clef";
import { expand, placeName } from "./expand";
import { geocode, reverseGeocode, type Place } from "./geocode";
import { preview, previewable } from "./preview";
import { bookletKey, Room } from "./room";
import { RoomsIndex, type Refusal } from "./rooms-index";

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
const lang = v.fallback(LangSchema, "ja");
/** Words as written, cut to `max` */
const cut = (max: number) =>
  v.pipe(
    v.string(),
    v.transform((s) => s.slice(0, max)),
  );
/** And, in a room, which one and who the asker is in it */
type InRoom = ApiEnv & {
  Variables: { roomId: RoomId; memberId: MemberId; room: DurableObjectStub<Room> };
};

/** A room's path; an id that is not a UUID is no room (`roomInPath` answers 404) */
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
 * The asker as a member of the room in the path, as `roomInPath` (before it) checked it, or,
 * `deleted`, of the room as it was; logged with what they asked for. Anyone else is refused. A
 * plain handler, as `ownerOnly` is, so the refusal is among the answers hc types the call with
 */
const member =
  (action: string, deleted = false) =>
  async (c: Context<InRoom, string, { out: { param: { roomId: RoomId } } }>, next: Next) => {
    const { roomId } = c.req.valid("param");
    const memberId = await c.env.ROOMS.getByName("index").resolve(c.var.email, roomId, deleted);
    if (memberId === null) return c.json(refusal("not a member"), 403);
    c.var.log.set({ room: roomId, member: memberId, action });
    c.set("roomId", roomId);
    c.set("memberId", memberId);
    c.set("room", c.env.ROOM.getByName(roomId));
    await next();
  };

/**
 * A paid call the asker's budget did not reserve (docs/auth-and-security.md): logged, and
 * declined with the ceiling it met
 */
const overBudget = (c: Context<InRoom>, ceiling: Refusal) => {
  c.var.log.set({ budget: { refused: ceiling } });
  return c.json({ ...refusal("over"), ceiling }, 429);
};

/** How a paid call settles: which answers spent nothing, and whether a call that threw did */
type Settle<T> = {
  /** the answer says nothing was spent, so the reservation goes back */
  refunds?: (answer: T) => boolean;
  /** a call that threw spent nothing either; a provider's may have, so by default it is spent */
  refundsThrown?: boolean;
};

/**
 * A paid call made for the asker (docs/auth-and-security.md): reserve, call, settle. Nothing is
 * called past the budget, and that answer (`overBudget`, a Response) is the route's to return;
 * else the call's answer, its reservation given back when `Settle` says nothing was spent
 */
const budgeted = async <T>(
  c: Context<InRoom>,
  call: () => T,
  { refunds = () => false, refundsThrown = false }: Settle<Awaited<NoInfer<T>>> = {},
) => {
  const index = c.env.ROOMS.getByName("index");
  const reserved = await index.reserve(c.var.email, c.var.roomId);
  if (!reserved.ok) return overBudget(c, reserved.reason);
  let answer: Awaited<T>;
  try {
    answer = await call();
  } catch (e) {
    if (refundsThrown) await index.refund(reserved.value);
    throw e;
  }
  if (refunds(answer)) await index.refund(reserved.value);
  return answer;
};

/** A provider's failure spent nothing when it answered with an error (`refund`) */
const providerRefused = (answer: ClaudeResult<unknown> | ClefResult) => !answer.ok && answer.refund;

/** A provider call that failed: logged under its name, with why and whether it was refunded */
const badGateway = (
  c: Context<InRoom>,
  provider: "claude" | "clef",
  { refund, reason }: { refund: boolean; reason: string },
) => {
  const failed = { ok: false, refunded: refund, reason };
  c.var.log.set(
    provider === "claude"
      ? { claude: { model: MODEL, ...failed } }
      : { clef: { model: CLEF_MODEL, ...failed } },
  );
  return c.text("Bad Gateway", 502);
};

/**
 * Only the room's owner gets past; anyone else is refused before anything is touched. A plain
 * handler, not `createMiddleware`, so the refusal is among the answers hc types the call with
 */
const ownerOnly = async (c: Context<InRoom>, next: Next) => {
  const { memberId, room } = c.var;
  if ((await room.owner(memberId)) !== memberId) return c.json(refusal("not the owner"), 403);
  await next();
};

/**
 * A refusal's answer: `error` says which one it is, as a word the app's client tells apart from
 * the others its call may answer with
 */
const refusal = <const E extends string>(error: E) => ({ error });

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

  .get(
    `${ROOM}/images/:imageId`,
    // the room and the picture, checked as `roomInPath` checks the room: an id the room could
    // not have minted is no picture
    sValidator("param", v.object({ roomId: RoomIdSchema, imageId: ImageIdSchema }), (result, c) =>
      result.success ? undefined : c.text("Not Found", 404),
    ),
    member("image"),
    async (c) => {
      const { roomId, memberId, room } = c.var;
      const { imageId } = c.req.valid("param");
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
    },
  )

  // an upload is a POST of the picture's bytes and must come from the app's origin, like any
  // call that changes something
  .post(
    `${ROOM}/images`,
    async (c, next) => {
      if (c.req.header("Origin") !== new URL(c.req.url).origin) return c.text("Forbidden", 403);
      await next();
    },
    roomInPath(),
    member("image"),
    async (c) => {
      const { roomId, memberId, room } = c.var;
      const type = parseImageType(c.req.header("Content-Type"));
      if (type === null) return c.text("Unsupported Media Type", 415);
      if (Number(c.req.header("Content-Length") ?? "0") > MAX_IMAGE_BYTES)
        return c.text("Payload Too Large", 413);
      const data = await c.req.arrayBuffer();
      if (data.byteLength === 0) return c.text("Bad Request", 400);
      if (data.byteLength > MAX_IMAGE_BYTES) return c.text("Payload Too Large", 413);
      // the room's list first, so its cap holds; the bytes after, and the entry goes if they
      // fail. The id as it is, not as the RPC's disposable stub of one: it goes out as JSON
      const stored: Result<ImageId, "full"> = await room.addImage(
        memberId,
        roomId,
        type,
        data.byteLength,
      );
      c.var.log.set({ image: { type, bytes: data.byteLength, stored: stored.ok } });
      // the room keeps as many pictures as it may
      if (!stored.ok) return c.json(refusal(stored.reason), 409);
      const { value: id } = stored;
      try {
        await c.env.IMAGES.put(imageKey(roomId, id), data, { httpMetadata: { contentType: type } });
      } catch (e) {
        await room.dropImage(id);
        throw e;
      }
      return c.json({ id }, 200);
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
    // and who is asking, so a device can tell whose what it kept is
    return c.json({ email, rooms, invitations, deleted }, 200);
  })

  // An invitation to a room, answered by the person invited
  .post("/invitations/:roomId/decline", roomInPath(), async (c) => {
    const { roomId } = c.req.valid("param");
    c.var.log.set({ room: roomId, action: "decline" });
    const seat = await c.env.ROOMS.getByName("index").take(c.var.email, roomId);
    if (seat === null) return c.text("Not Found", 404);
    await c.env.ROOM.getByName(roomId).closeSeat(seat);
    return c.json({}, 200);
  })
  // who they will be in the room is theirs to say, checked before the seat is taken
  .post("/invitations/:roomId/accept", roomInPath(), body(ProfileSchema), async (c) => {
    const { roomId } = c.req.valid("param");
    c.var.log.set({ room: roomId, action: "accept" });
    const me = c.req.valid("json");
    const index = c.env.ROOMS.getByName("index");
    // the invitation stays until the membership is recorded, and the seat remembers whom it let
    // in: an acceptance that failed after the room let them in is finished by asking again
    const seat = await index.invitation(c.var.email, roomId);
    if (seat === null) return c.text("Not Found", 404);
    const room = c.env.ROOM.getByName(roomId);
    const accepted = await room.accept(seat, me);
    if (!accepted.ok) {
      c.var.log.set({ refused: accepted.reason });
      await index.take(c.var.email, roomId);
      return c.json(refusal(accepted.reason), 409);
    }
    const memberId = accepted.value;
    const added = await index.add(c.var.email, roomId, memberId);
    if (!added.ok) {
      c.var.log.set({ refused: added.reason });
      // at the cap of rooms: the seat is lost, as a declined one would be
      await room.unaccept(memberId);
      await index.take(c.var.email, roomId);
      return c.json(refusal(added.reason), 409);
    }
    c.var.log.set({ member: memberId });
    return c.json({ memberId }, 200);
  })

  .post("/rooms", body(v.object({ trip: NewTripSchema, me: ProfileSchema })), async (c) => {
    const { trip, me } = c.req.valid("json");
    const roomId = v.parse(RoomIdSchema, crypto.randomUUID());
    // the id as it is, not as the RPC's disposable stub of one: it goes out as JSON
    const room = c.env.ROOM.getByName(roomId);
    const memberId: MemberId = await room.create(trip, me);
    const added = await c.env.ROOMS.getByName("index").add(c.var.email, roomId, memberId);
    if (!added.ok) {
      c.var.log.set({ refused: added.reason });
      // a room nobody can reach is not left set up
      await room.discard();
      return c.json(refusal(added.reason), 409);
    }
    return c.json({ roomId, memberId }, 200);
  })

  // a deleted room resolves nobody, but the people who were in it may take the deletion
  // back, and its owner may have it gone for good at once (the room drops itself from the index)
  .post(`${ROOM}/restore`, roomInPath(), member("restore", true), async (c) => {
    const { roomId, memberId, room } = c.var;
    const restored = await room.restore(memberId);
    // the room is not deleted either way, restored now or by a try whose index call failed: the
    // index shows it again
    await c.env.ROOMS.getByName("index").mark(roomId, null);
    if (!restored.ok) {
      c.var.log.set({ refused: restored.reason });
      return c.json(refusal(restored.reason), 403);
    }
    return c.json({}, 200);
  })
  .post(`${ROOM}/purge`, roomInPath(), member("purge", true), async (c) => {
    const purged = await c.var.room.purge(c.var.memberId);
    if (!purged.ok) {
      c.var.log.set({ refused: purged.reason });
      return c.json(refusal(purged.reason), 403);
    }
    return c.json({}, 200);
  })

  .get(`${ROOM}/ws`, roomInPath(), member("ws"), async (c) => {
    if (c.req.header("Upgrade") !== "websocket") return c.text("Forbidden", 403);
    // Only the upgrade goes through fetch, with the resolved member in a header of our own
    return await c.var.room.fetch(
      new Request(c.req.url, {
        headers: { Upgrade: "websocket", [Room.MEMBER_HEADER]: c.var.memberId },
      }),
    );
  })

  .post(
    `${ROOM}/draft`,
    roomInPath(),
    member("draft"),
    body(v.object({ date: IsoDateSchema })),
    async (c) => {
      const { log, memberId, room } = c.var;
      const { date } = c.req.valid("json");
      const day = await room.dayForDraft(memberId, date);
      if (day === null) return c.text("Bad Request", 400);
      log.set({ draft: { date, notes: day.notes.length } });
      const result = await budgeted(c, () => draftDay(c.env, day), { refunds: providerRefused });
      if (result instanceof Response) return result;
      if (!result.ok) return badGateway(c, "claude", result);
      await room.recordAgentCall(memberId, "draft", result.usage);
      log.set({
        claude: { model: MODEL, ok: true, tokens: result.usage, items: result.value.items.length },
      });
      return c.json({ by: Room.AGENT_ID, ...result.value }, 200);
    },
  )

  // the memo as it is being written: its words, the tags it has, and its picture
  .post(
    `${ROOM}/tags`,
    roomInPath(),
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
      const { log, roomId, memberId, room } = c.var;
      const { title, body: text, chosen, image: imageId } = c.req.valid("json");

      const context = await room.tagContext(memberId);
      let candidates = context.candidates;
      // the trip's candidates, once: Claude proposes them the first time anyone asks, and only
      // for that ask, however many come at once
      if (candidates.length === 0 && (await room.claimProposal(memberId))) {
        const proposed = await budgeted(c, () => proposeTags(c.env, context), {
          refunds: providerRefused,
        });
        if (proposed instanceof Response) {
          await room.releaseProposal(memberId);
          return proposed;
        }
        if (proposed.ok) {
          await room.recordAgentCall(memberId, "tags", proposed.usage);
          candidates = proposed.value;
        }
        // nothing spent: a later ask proposes them; spent on an answer with no tags to keep, it
        // was proposed all the same
        if (providerRefused(proposed)) await room.releaseProposal(memberId);
        else await room.saveCandidates(memberId, candidates);
        // without candidates Clef still judges the tags in use
        log.set({ claude: { model: MODEL, ok: proposed.ok, candidates: candidates.length } });
      }

      const taken = new Set(chosen.map((t) => t.toLowerCase()));
      const vocabulary = [...new Set([...context.tags, ...candidates])]
        .filter((t) => !taken.has(t.toLowerCase()))
        .slice(0, MAX_TAGS);
      if (vocabulary.length === 0) return c.json({ tags: [] }, 200);

      // the picture goes along: Clef looks at it with the words
      let image: MemoToTag["image"] = null;
      if (imageId !== null && (await room.hasImageFor(memberId, imageId))) {
        const object = await c.env.IMAGES.get(imageKey(roomId, imageId));
        // stored with the type it was uploaded as (one of IMAGE_TYPES); one that says none is WebP
        const type = parseImageType(object?.httpMetadata?.contentType ?? "image/webp");
        if (object !== null && type !== null)
          image = { type, base64: toBase64(await object.arrayBuffer()) };
      }

      const judged = await budgeted(
        c,
        () => judgeTags(c.env, { title, body: text, image }, vocabulary),
        { refunds: providerRefused },
      );
      if (judged instanceof Response) return judged;
      if (!judged.ok) return badGateway(c, "clef", judged);
      await room.recordAgentCall(memberId, "tag", { input: 0, output: 0 });
      // how likely the likeliest were, numbers only: what the threshold should be is read here
      log.set({
        clef: {
          model: CLEF_MODEL,
          ok: true,
          asked: vocabulary.length,
          fitting: judged.value.filter((t) => t.p >= FITS_AT).length,
          top: judged.value.slice(0, 3).map((t) => Math.round(t.p * 100) / 100),
        },
      });
      const inUse = new Set(context.tags);
      // each one a tag a memo may carry (wire.ts), as the app takes it
      const tags = judged.value.flatMap(({ tag, p }) => {
        const t = parseTag(tag);
        return t === null ? [] : [{ tag: t, p, isNew: !inUse.has(tag) }];
      });
      return c.json({ tags }, 200);
    },
  )

  // the trip's candidate tags, for the form to rank as the words are typed: free, so not budgeted
  .post(`${ROOM}/candidates`, roomInPath(), member("candidates"), async (c) => {
    const { candidates } = await c.var.room.tagContext(c.var.memberId);
    return c.json({ tags: candidates.flatMap((t) => parseTag(t) ?? []) }, 200);
  })

  // a short Google Maps link, expanded by reading its one redirect; anything else is answered
  // as it came, without a fetch. A fetch of a URL a person typed counts against their budget
  .post(
    `${ROOM}/expand`,
    roomInPath(),
    member("expand"),
    body(v.object({ url: v.pipe(v.string(), v.maxLength(2000)), lang })),
    async (c) => {
      const { log } = c.var;
      const { url, lang } = c.req.valid("json");
      if (!isShortMapsLink(url)) return c.json({ url, at: null }, 200);
      const expanded = await budgeted(c, () => expand(url, c.env.SHORTLINK_BASE_URL));
      if (expanded instanceof Response) return expanded;
      // a short link most often leads to the place's name (`/maps/place/<name>/data=…`, or
      // `?q=<name>`), not its point: then OpenStreetMap finds the name, free, and its point is the link's
      let at: LatLng | null = null;
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
      return c.json({ url: expanded ?? url, at }, 200);
    },
  )

  // what a page a note links to says of itself (preview.ts): its title, a line and its picture,
  // which the room keeps as one of its pictures. The Worker fetches a page the member pasted,
  // so it is fenced there and budgeted here (docs/auth-and-security.md, "Previewing links")
  .post(
    `${ROOM}/preview`,
    roomInPath(),
    member("preview"),
    body(v.object({ url: v.pipe(v.string(), v.trim(), v.maxLength(2000)) })),
    async (c) => {
      const { log, roomId, memberId, room } = c.var;
      const { url } = c.req.valid("json");
      const ours = [c.env.APP_HOST, c.env.BOOKLET_HOST];
      // an address that is never fetched is no preview, and costs nothing
      if (previewable(url, ours) === null) return c.json({ preview: null }, 200);
      const found = await budgeted(c, () => preview(url, ours, c.env.PREVIEW_BASE_URL));
      if (found instanceof Response) return found;
      // the site it was on, never the address: enough to tell which kinds of pages say nothing
      log.set({
        preview: { ok: found !== null, site: found?.site ?? null, picture: found?.image !== null },
      });
      if (found === null) return c.json({ preview: null }, 200);
      // where it ended, as a link a note may carry: one that is not (too long) is no preview
      const link = parseHttpUrl(found.url);
      if (link === null) return c.json({ preview: null }, 200);
      let image: ImageId | null = null;
      if (found.image !== null) {
        const { bytes, type } = found.image;
        const stored = await room.addImage(memberId, roomId, type, bytes.byteLength);
        if (stored.ok) {
          try {
            await c.env.IMAGES.put(imageKey(roomId, stored.value), bytes, {
              httpMetadata: { contentType: type },
            });
            image = stored.value;
          } catch {
            await room.dropImage(stored.value);
          }
        }
      }
      const { title, description, site } = found;
      return c.json({ preview: { url: link, site, title, description, image } }, 200);
    },
  )

  // places by a name the asker typed (a stay's): OpenStreetMap only, free (no agent), so not budgeted
  .post(
    `${ROOM}/find`,
    roomInPath(),
    member("find"),
    body(v.object({ query: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(200)), lang })),
    async (c) => {
      const { query, lang } = c.req.valid("json");
      const found = await geocode(c.env, query, lang);
      c.var.log.set({ geocoder: { ok: found !== null, found: found?.length ?? 0 } });
      if (found === null) return c.text("Bad Gateway", 502);
      return c.json({ places: found }, 200);
    },
  )

  // what is at a point the asker pinned on the map: free (no agent), so not budgeted
  .post(
    `${ROOM}/where`,
    roomInPath(),
    member("where"),
    body(v.object({ ...LatLngSchema.entries, lang })),
    async (c) => {
      const { lat, lng, lang } = c.req.valid("json");
      const found = await reverseGeocode(c.env, { lat, lng }, lang);
      c.var.log.set({
        geocoder: { reverse: true, ok: found !== null, found: found?.place != null },
      });
      if (found === null) return c.text("Bad Gateway", 502);
      return c.json(found, 200);
    },
  )

  // the memo as it is being written; the places are named in the asker's language
  .post(
    `${ROOM}/places`,
    roomInPath(),
    member("places"),
    body(
      v.pipe(
        v.object({
          title: v.fallback(v.pipe(v.string(), v.trim(), cut(200)), ""),
          body: v.fallback(v.pipe(v.string(), v.trim(), cut(4000)), ""),
          // as many as a memo has, each one a tag (wire.ts): what goes into Claude's prompt is bounded
          tags: v.pipe(
            v.optional(v.array(v.string()), []),
            v.transform((tags) =>
              tags.slice(0, 20).flatMap((t) => {
                const tag = parseTag(t);
                return tag === null ? [] : [tag];
              }),
            ),
          ),
          lang,
        }),
        // a memo with no words names no place
        v.check(({ title, body }) => title !== "" || body !== ""),
      ),
    ),
    async (c) => {
      const { log, memberId, room } = c.var;
      const { title, body: text, tags, lang } = c.req.valid("json");

      const context = await room.placeContext(memberId);
      const named = await budgeted(
        c,
        () => namePlace(c.env, context, { title, body: text, tags }),
        { refunds: providerRefused },
      );
      if (named instanceof Response) return named;
      if (!named.ok) return badGateway(c, "claude", named);
      await room.recordAgentCall(memberId, "places", named.usage);

      // the best query first; the other only when the first finds nothing (geocode.ts spaces them)
      let places: Place[] = [];
      for (const query of named.value) {
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
      return c.json({ places }, 200);
    },
  )

  // where the cards land on the desk (where the asker is looking, or beside the note asked
  // from), and what the asker asked for: their words, the note they started from, or neither
  .post(
    `${ROOM}/suggest`,
    roomInPath(),
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
      const { log, memberId, room } = c.var;
      const { at, ask, about } = c.req.valid("json");
      const context = await room.contextForSuggest(memberId, about);
      // the note asked from is gone (deleted on the other phone): nothing is called
      if (context === null) return c.text("Not Found", 404);
      log.set({
        suggest: { notes: context.notes.length, ask: ask !== null, about: about !== null },
      });
      const result = await budgeted(c, () => suggestNotes(c.env, context, ask), {
        refunds: providerRefused,
      });
      if (result instanceof Response) return result;
      if (!result.ok) return badGateway(c, "claude", result);
      await room.recordAgentCall(memberId, "suggest", result.usage);
      const added = await room.addSuggestions(memberId, result.value, at);
      log.set({ claude: { model: MODEL, ok: true, tokens: result.usage, items: added } });
      return c.json({ added }, 200);
    },
  )

  // The booklet as a public page (docs/auth-and-security.md): every member sees whether it is
  // up and its link; only the owner puts it up (again, under a new link) or takes it down.
  .post(`${ROOM}/publication`, roomInPath(), member("publication"), async (c) => {
    const p = await c.var.room.publication(c.var.memberId);
    return c.json(
      { publication: p === null ? null : { url: bookletUrl(c.env, p.slug), at: p.at } },
      200,
    );
  })
  // the owner is checked before the budget is touched
  .post(
    `${ROOM}/publish`,
    roomInPath(),
    member("publish"),
    body(v.object({ lang })),
    ownerOnly,
    async (c) => {
      const { log, memberId, room } = c.var;
      const { lang } = c.req.valid("json");
      // each publish writes to R2 at a rate the member chooses, so it counts like a paid call;
      // a refusal or a failed write spent nothing
      const published = await budgeted(c, () => room.publish(memberId, lang), {
        refunds: (p) => !p.ok,
        refundsThrown: true,
      });
      if (published instanceof Response) return published;
      if (!published.ok) return c.json(refusal(published.reason), 403);
      log.set({ publish: { at: published.value.at } });
      return c.json(
        {
          publication: { url: bookletUrl(c.env, published.value.slug), at: published.value.at },
        },
        200,
      );
    },
  )
  .post(`${ROOM}/withdraw`, roomInPath(), member("withdraw"), async (c) => {
    const out = await c.var.room.withdraw(c.var.memberId);
    if (!out.ok) {
      c.var.log.set({ refused: out.reason });
      return c.json(refusal(out.reason), 403);
    }
    return c.json({}, 200);
  })

  // Who is in a room, and who is asked in: the owner invites, takes an invitation back, removes
  // someone and deletes the room; anyone else may leave. The room decides who may; the index
  // keeps the e-mails.

  // the e-mails invited are the owner's to see: they typed them. Who owns the room and how
  // many it holds every member knows already, from the socket and the app.
  .post(`${ROOM}/invited`, roomInPath(), member("invited"), ownerOnly, async (c) =>
    c.json({ invited: await c.env.ROOMS.getByName("index").invited(c.var.roomId) }, 200),
  )
  .post(
    `${ROOM}/invite`,
    roomInPath(),
    member("invite"),
    body(v.object({ email: EmailSchema })),
    ownerOnly,
    async (c) => {
      const { roomId, memberId, room } = c.var;
      const { email: invitee } = c.req.valid("json");
      const held = await room.openSeat(memberId);
      if (!held.ok) {
        c.var.log.set({ refused: held.reason });
        return c.json(refusal(held.reason), 409);
      }
      const { value: seat } = held;
      const invited = await c.env.ROOMS.getByName("index").invite(invitee, roomId, seat);
      if (!invited.ok) {
        await room.closeSeat(seat);
        c.var.log.set({ refused: invited.reason });
        return c.json(refusal(invited.reason), 409);
      }
      return c.json({ invited: invitee }, 200);
    },
  )
  .post(
    `${ROOM}/uninvite`,
    roomInPath(),
    member("uninvite"),
    body(v.object({ email: EmailSchema })),
    ownerOnly,
    async (c) => {
      const { roomId, room } = c.var;
      const { email: invitee } = c.req.valid("json");
      const seat = await c.env.ROOMS.getByName("index").take(invitee, roomId);
      if (seat === null) return c.text("Not Found", 404);
      await room.closeSeat(seat);
      return c.json({}, 200);
    },
  )
  .post(
    `${ROOM}/remove`,
    roomInPath(),
    member("remove"),
    body(v.object({ member: MemberIdSchema })),
    async (c) => {
      const { roomId, memberId, room } = c.var;
      const { member: removed } = c.req.valid("json");
      const out = await room.remove(memberId, removed);
      // out of the room, now or by a try whose index call failed: the index forgets them either way
      if (out.ok || out.reason === "not in")
        await c.env.ROOMS.getByName("index").forget(roomId, removed);
      if (!out.ok) {
        c.var.log.set({ refused: out.reason });
        return c.json(refusal(out.reason), 403);
      }
      return c.json({}, 200);
    },
  )
  // a leave whose index call failed is asked again: the room answers it as left
  .post(`${ROOM}/leave`, roomInPath(), member("leave"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const out = await room.remove(memberId, memberId);
    if (!out.ok) {
      c.var.log.set({ refused: out.reason });
      return c.json(refusal(out.reason), 403);
    }
    await c.env.ROOMS.getByName("index").forget(roomId, memberId);
    return c.json({}, 200);
  })
  .post(`${ROOM}/delete`, roomInPath(), member("delete"), async (c) => {
    const { roomId, memberId, room } = c.var;
    const deleted = await room.delete(memberId, roomId);
    if (!deleted.ok) {
      c.var.log.set({ refused: deleted.reason });
      return c.json(refusal(deleted.reason), 403);
    }
    await c.env.ROOMS.getByName("index").mark(roomId, await room.deletedAt());
    return c.json({}, 200);
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

/** A published booklet's public address, a link on the booklet's own host */
const bookletUrl = (env: Env, slug: string): HttpUrl =>
  v.parse(HttpUrlSchema, `https://${env.BOOKLET_HOST}/r/${slug}/shiori`);

/** A slug as newSlug() makes one; anything else is no booklet, and R2 is not asked */
const SlugSchema = v.pipe(v.string(), v.nanoid(), v.length(22));

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
  if (slug === undefined || !v.is(SlugSchema, slug)) return notFound();
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

/** The room in the path, checked as `body` checks JSON: an id that is not a UUID is no room */
function roomInPath() {
  return sValidator("param", v.object({ roomId: RoomIdSchema }), (result, c) =>
    result.success ? undefined : c.text("Not Found", 404),
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
