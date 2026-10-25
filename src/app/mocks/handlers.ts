import { Temporal } from "temporal-polyfill-lite";

import type { hc, InferResponseType } from "hono/client";
import type { StatusCode } from "hono/utils/http-status";
import { http, HttpResponse, ws, type WebSocketHandlerConnection } from "msw";
import * as v from "valibot";

import type { Api } from "../../../.worker-types/worker";
import { listOf } from "../../contract";
import { EmailSchema, parseEmail, SEATS, type Email, type Member } from "../features/members/types";
import { ImageIdSchema, NoteIdSchema, parseImageId, type ImageId } from "../features/notes/id";
import { parseTag, type Note } from "../features/notes/types";
import {
  HttpUrlSchema,
  isShortMapsLink,
  parseHttpUrl,
  type HttpUrl,
} from "../features/place/google-maps";
import { parseRoomId, RoomIdSchema, type RoomId } from "../features/rooms/types";
import { applyToRoom, type RoomState } from "../features/sync/ledger";
import { reviveMutation, reviveNote, reviveTrip } from "../features/sync/wire";
import type { TripSnapshot } from "../features/trip/types";

import { CLAUDE, mockMembers, YUKI } from "./members";
import { mockNotes } from "./notes";
import { mockTrip } from "./trip";
import {
  parseAirportCode,
  IsoInstantSchema,
  NewTripSchema,
  parseCid,
  parseMutation,
  PointSchema,
  ProfileSchema,
  WireMemberSchema,
  WireNoteSchema,
  WireRoomSummarySchema,
  WireTripSchema,
  type IsoInstant,
  type ServerMessage,
  type WireMutation,
  type WireNote,
} from "./wire";

/**
 * The Worker and its rooms, in the page: what `/api` answers and what a room's socket says,
 * for the app to run as it does against the real ones. The person signed in is always Yuki,
 * the owner of the trip seeded here. Nothing is kept: a reload starts from the seed again.
 */

/** The Worker's API as the app's client (hc) has it, typed by the Worker's routes */
type Calls = ReturnType<typeof hc<Api>>["api"];
type InRoom = Calls["rooms"][":roomId"];

/**
 * What a call answers with `status`, as its route on the Worker says: every answer here is
 * typed by it, so a mock that drifts from the Worker does not compile
 */
type Answer<Call, Status extends StatusCode = 200> = Call extends { $post: infer Post }
  ? InferResponseType<Post, Status>
  : never;

interface MockRoom {
  state: RoomState & { trip: TripSnapshot };
  invited: Email[];
  deletedAt: IsoInstant | null;
  images: Map<ImageId, Blob>;
  /** The booklet as a public page: a link that leads nowhere here, and when */
  publication: { url: HttpUrl; at: IsoInstant } | null;
}

/** The seeded trip's room */
export const MOCK_ROOM = v.parse(RoomIdSchema, "7a1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d");

const rooms = new Map<RoomId, MockRoom>([
  [
    MOCK_ROOM,
    {
      state: { notes: mockNotes(), trip: mockTrip(), members: mockMembers() },
      invited: [],
      deletedAt: null,
      images: new Map(),
      publication: null,
    },
  ],
]);

/** The app's values as they cross the wire (Temporal values as their ISO strings), checked as the room's are */
const wire = <S extends v.GenericSchema>(schema: S, value: unknown): v.InferOutput<S> =>
  v.parse(schema, JSON.parse(JSON.stringify(value)));

const forbidden = () => new HttpResponse(null, { status: 403 });
const notFound = () => new HttpResponse(null, { status: 404 });
const badRequest = () => new HttpResponse(null, { status: 400 });
/** A moment as the room stamps it */
const stamp = (t: Temporal.Instant): IsoInstant => v.parse(IsoInstantSchema, t.toString());

/** The trip's candidate tags, as the agent would have proposed them */
const CANDIDATES = ["Airport", "Souvenirs", "Night markets", "Temples", "Tea"].flatMap(
  (t) => parseTag(t) ?? [],
);

/** The room a request names, if there is one and it is not deleted */
const open = (id: unknown) => {
  const room = find(id);
  return room?.deletedAt === null ? room : undefined;
};

/** The room a request names, deleted or not */
const find = (id: unknown) => {
  const room = parseRoomId(id);
  return room === null ? undefined : rooms.get(room);
};

/** A field of a request's JSON body, when it is a string */
const textOf = (body: unknown, field: string): string | null => {
  const read = v.safeParse(v.object({ [field]: v.string() }), body);
  return read.success ? (read.output[field] ?? null) : null;
};

/**
 * A room as the list shows it, checked as the Worker's answer is (no days is no first day);
 * its id goes beside the summary, as the Worker puts it
 */
const summary = (id: RoomId, { state }: MockRoom) => ({
  id,
  ...wire(WireRoomSummarySchema, {
    name: state.trip.name,
    first: state.trip.days[0]?.date ?? null,
    days: state.trip.days.length,
    // the people first, the creator leading; the agent after them
    members: [...state.members]
      .sort((a, b) => Number(a.kind === "agent") - Number(b.kind === "agent"))
      .map(({ kind, name, color }) => ({ kind, name, color })),
    memos: state.notes.filter((n) => n.kind === "memo").length,
    owner: true,
  }),
});

// ---- the room's socket ----

const scheme = location.protocol === "https:" ? "wss" : "ws";
const socket = ws.link(`${scheme}://${location.host}/api/rooms/:roomId/ws`);
/** Who is connected to which room */
const sockets = new Map<RoomId, Set<WebSocketHandlerConnection["client"]>>();

const send = (client: WebSocketHandlerConnection["client"], msg: ServerMessage) =>
  client.send(JSON.stringify(msg));
const tell = (id: RoomId, msg: ServerMessage, except?: WebSocketHandlerConnection["client"]) => {
  for (const c of sockets.get(id) ?? []) if (c !== except) send(c, msg);
};

const roomSocket = socket.addEventListener("connection", ({ client, params }) => {
  const id = parseRoomId(params.roomId);
  const room = open(params.roomId);
  if (id === null || room === undefined) {
    client.close(4001, "deleted");
    return;
  }
  sockets.set(id, (sockets.get(id) ?? new Set()).add(client));
  client.addEventListener("close", () => sockets.get(id)?.delete(client));
  send(client, {
    type: "snapshot",
    me: YUKI,
    members: wire(v.array(WireMemberSchema), room.state.members),
    trip: wire(WireTripSchema, room.state.trip),
    notes: wire(v.array(WireNoteSchema), room.state.notes),
  });

  client.addEventListener("message", (e) => {
    if (typeof e.data !== "string") return;
    // the app's heartbeat, answered as the Worker's room answers it
    if (e.data === "ping") {
      client.send("pong");
      return;
    }
    const sent: unknown = JSON.parse(e.data);
    const cid = parseCid(sent);
    const at = Temporal.Now.instant();
    // checked, and a new note stamped with whose it is and when, as the Worker's room does
    const mutation = parseMutation(sent, { by: YUKI, updatedAt: stamp(at) }, parseAirportCode);
    if (mutation === null) {
      send(client, {
        type: "rejected",
        reason: "not a mutation",
        ...(cid === null ? {} : { cid }),
      });
      return;
    }
    // one without a cid is a card on its way under a finger: relayed, not kept
    if (cid !== null) {
      const next = applyToRoom(room.state, reviveMutation(mutation), YUKI, at);
      if (next.trip !== null) room.state = { ...next, trip: next.trip };
    }
    tell(id, { type: "mutation", mutation, by: YUKI, updatedAt: stamp(at) }, client);
    if (cid !== null) send(client, { type: "ack", cid, updatedAt: stamp(at) });
  });
});

// ---- the agent's calls ----

const SLOTS = ["10:00", "12:30", "16:00", "20:30"];
/** About as long as a real draft takes, so the pending state can be seen while developing */
const THINKING_MS = 1200;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const agent = [
  http.post("/api/rooms/:roomId/draft", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const date = textOf(await request.json(), "date");
    if (date === null) return badRequest();
    await wait(THINKING_MS);
    const day = Temporal.PlainDate.from(date);
    const items = room.state.notes.flatMap((n: Note) =>
      n.kind === "memo" && n.schedule !== null && n.schedule.date.equals(day) ? [n.id] : [],
    );
    return HttpResponse.json<Answer<InRoom["draft"]>>({
      by: CLAUDE,
      reason: "Given the locations and opening hours, this order means the least walking.",
      intro: "Xiaolongbao for lunch, Jiufen in the evening, then beer in Xinyi.",
      items: items.map((id, i) => ({ id, time: SLOTS[i] ?? null, minutes: 90 })),
    });
  }),
  http.post("/api/rooms/:roomId/suggest", async ({ params, request }) => {
    const id = parseRoomId(params.roomId);
    const room = open(params.roomId);
    if (id === null || room === undefined) return forbidden();
    const body = v.safeParse(
      v.object({ at: PointSchema, about: v.optional(v.nullable(NoteIdSchema), null) }),
      await request.json(),
    );
    if (!body.success) return badRequest();
    // the note asked from must still be on the desk, as the Worker checks
    const { at, about } = body.output;
    if (about !== null && !room.state.notes.some((n) => n.id === about)) {
      return new HttpResponse("Not Found", { status: 404 });
    }
    await wait(THINKING_MS);
    const titles = ["Night view from Elephant Mountain", "Beef noodles at Yongkang Street"];
    const updatedAt = stamp(Temporal.Now.instant());
    titles.forEach((title, i) => {
      const note: WireNote = {
        id: v.parse(NoteIdSchema, crypto.randomUUID()),
        kind: "suggestion",
        title,
        color: "#ffffff",
        x: at.x - 82 + (i % 2 === 0 ? -12 : 12),
        y: at.y - 40 + i * 120,
        rot: Math.random() * 4 - 2,
        scale: 1,
        by: CLAUDE,
        updatedAt,
      };
      const mutation: WireMutation = { type: "note:add", note };
      room.state = { ...room.state, notes: [...room.state.notes, reviveNote(note)] };
      tell(id, { type: "mutation", mutation, by: CLAUDE, updatedAt });
    });
    return HttpResponse.json<Answer<InRoom["suggest"]>>({ added: titles.length });
  }),
  http.post("/api/rooms/:roomId/tags", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const body = v.safeParse(v.object({ chosen: listOf(v.string()) }), await request.json());
    const chosen = body.success ? body.output.chosen : [];
    const inUse = new Set(room.state.notes.flatMap((n) => (n.kind === "memo" ? n.tags : [])));
    // every tag judged, the likeliest first: the in-use ones, then the trip's candidates
    const tags = [...inUse, ...CANDIDATES.filter((t) => !inUse.has(t))].filter(
      (t) => !chosen.includes(t),
    );
    return HttpResponse.json<Answer<InRoom["tags"]>>({
      tags: tags.map((tag, i) => ({ tag, p: 0.9 * 0.8 ** i, isNew: !inUse.has(tag) })),
    });
  }),
  http.post("/api/rooms/:roomId/candidates", ({ params }) =>
    open(params.roomId) === undefined
      ? forbidden()
      : HttpResponse.json<Answer<InRoom["candidates"]>>({ tags: CANDIDATES }),
  ),
  // the typed name as one place near the trip's center, as OpenStreetMap would find it
  http.post("/api/rooms/:roomId/find", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const query = textOf(await request.json(), "query");
    if (query === null) return badRequest();
    const { lat, lng } = room.state.trip.center;
    return HttpResponse.json<Answer<InRoom["find"]>>({
      places: [{ name: query.trim(), address: "臺北市, 臺灣", lat, lng, hours: null }],
    });
  }),
  // a short link leads to a point near the trip's center, as maps.app.goo.gl's redirect would;
  // any other link comes back as it was
  // what a page says of itself: a title and a line from its host, and a picture drawn here (a
  // 16:9 frame with the site on it), kept as one of the room's like a real one would be
  http.post("/api/rooms/:roomId/preview", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const url = textOf(await request.json(), "url");
    if (url === null) return badRequest();
    await wait(THINKING_MS / 2);
    // a page is only at a link a note may carry, as the Worker says
    const link = parseHttpUrl(url);
    if (link === null) return HttpResponse.json<Answer<InRoom["preview"]>>({ preview: null });
    const site = new URL(link).hostname.replace(/^www\./, "");
    const frame = new OffscreenCanvas(640, 360);
    const ctx = frame.getContext("2d");
    let image: ImageId | null = null;
    if (ctx !== null) {
      const sky = ctx.createLinearGradient(0, 0, 640, 360);
      sky.addColorStop(0, "#5b8def");
      sky.addColorStop(1, "#e36d7a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText(site, 32, 200);
      image = v.parse(ImageIdSchema, crypto.randomUUID());
      room.images.set(image, await frame.convertToBlob({ type: "image/png" }));
    }
    return HttpResponse.json<Answer<InRoom["preview"]>>({
      preview: {
        url: link,
        site,
        title: `A page on ${site}`,
        description: "What the page says of itself, in a line",
        image,
      },
    });
  }),
  http.post("/api/rooms/:roomId/expand", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const url = textOf(await request.json(), "url");
    if (url === null) return badRequest();
    if (!isShortMapsLink(url))
      return HttpResponse.json<Answer<InRoom["expand"]>>({ url, at: null });
    const { lat, lng } = room.state.trip.center;
    return HttpResponse.json<Answer<InRoom["expand"]>>({
      url: `https://www.google.com/maps/search/${lat},+${lng}`,
      at: null,
    });
  }),
  // the memo's title as one place near the trip's center, open in the evening, as OpenStreetMap writes it
  http.post("/api/rooms/:roomId/places", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const title = textOf(await request.json(), "title");
    if (title === null) return badRequest();
    const { lat, lng } = room.state.trip.center;
    return HttpResponse.json<Answer<InRoom["places"]>>({
      places: [{ name: title, address: "臺北市, 臺灣", lat, lng, hours: "Mo-Su 17:00-24:00" }],
    });
  }),
  http.post("/api/rooms/:roomId/where", ({ params }) =>
    open(params.roomId) === undefined
      ? forbidden()
      : HttpResponse.json<Answer<InRoom["where"]>>({ place: null }),
  ),
  http.post("/api/rooms/:roomId/images", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const id = v.parse(ImageIdSchema, crypto.randomUUID());
    room.images.set(id, await request.blob());
    return HttpResponse.json<Answer<InRoom["images"]>>({ id });
  }),
  http.get("/api/rooms/:roomId/images/:id", ({ params }) => {
    const id = parseImageId(params.id);
    const image = id === null ? undefined : open(params.roomId)?.images.get(id);
    return image === undefined ? notFound() : new HttpResponse(image);
  }),
];

// ---- the booklet as a public page: only the owner (the seeded person, this device) puts it up ----

const publishing = [
  http.post("/api/rooms/:roomId/publication", ({ params }) => {
    const room = open(params.roomId);
    return room === undefined
      ? forbidden()
      : HttpResponse.json<Answer<InRoom["publication"]>>({ publication: room.publication });
  }),
  http.post("/api/rooms/:roomId/publish", async ({ params }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    await wait(THINKING_MS / 2);
    // a fresh slug each time, as the Worker mints one; nothing is served behind it here
    const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 22);
    room.publication = {
      url: v.parse(HttpUrlSchema, `https://shiori.chirashitabi.app/r/${slug}/shiori`),
      at: stamp(Temporal.Now.instant()),
    };
    return HttpResponse.json<Answer<InRoom["publish"]>>({ publication: room.publication });
  }),
  http.post("/api/rooms/:roomId/withdraw", ({ params }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    room.publication = null;
    return HttpResponse.json<Answer<InRoom["withdraw"]>>({});
  }),
];

// ---- who is in ----

const members = [
  http.post("/api/rooms/:roomId/invited", ({ params }) => {
    const room = open(params.roomId);
    return room === undefined
      ? forbidden()
      : HttpResponse.json<Answer<InRoom["invited"]>>({ invited: room.invited });
  }),
  http.post("/api/rooms/:roomId/invite", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const email = parseEmail(textOf(await request.json(), "email"));
    if (email === null) return badRequest();
    const people = room.state.members.filter((m) => m.kind === "person").length;
    if (people + room.invited.length >= SEATS)
      return HttpResponse.json<Answer<InRoom["invite"], 409>>(
        { error: "no seat" },
        { status: 409 },
      );
    if (room.invited.includes(email))
      return HttpResponse.json<Answer<InRoom["invite"], 409>>(
        { error: "already invited" },
        { status: 409 },
      );
    room.invited = [...room.invited, email];
    return HttpResponse.json<Answer<InRoom["invite"]>>({ invited: email });
  }),
  http.post("/api/rooms/:roomId/uninvite", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const email = parseEmail(textOf(await request.json(), "email"));
    if (email === null) return badRequest();
    if (!room.invited.includes(email)) return notFound();
    room.invited = room.invited.filter((e) => e !== email);
    return HttpResponse.json<Answer<InRoom["uninvite"]>>({});
  }),
  http.post("/api/rooms/:roomId/remove", async ({ params, request }) => {
    const id = parseRoomId(params.roomId);
    const room = open(params.roomId);
    if (id === null || room === undefined) return forbidden();
    const member = textOf(await request.json(), "member");
    if (member === null) return badRequest();
    const gone = room.state.members.find((m) => m.id === member);
    if (gone?.kind !== "person")
      return HttpResponse.json<Answer<InRoom["remove"], 403>>({ error: "not in" }, { status: 403 });
    if (gone.role === "owner")
      return HttpResponse.json<Answer<InRoom["remove"], 403>>(
        { error: "the owner" },
        { status: 403 },
      );
    const left: Member[] = room.state.members.filter((m) => m !== gone);
    room.state = { ...room.state, members: left };
    tell(id, { type: "members", members: wire(v.array(WireMemberSchema), left) });
    return HttpResponse.json<Answer<InRoom["remove"]>>({});
  }),
  // Yuki owns every room here, and the owner never leaves their own
  http.post("/api/rooms/:roomId/leave", () =>
    HttpResponse.json<Answer<InRoom["leave"], 403>>({ error: "the owner" }, { status: 403 }),
  ),
  http.post("/api/rooms/:roomId/delete", ({ params }) => {
    const id = parseRoomId(params.roomId);
    const room = open(params.roomId);
    if (id === null || room === undefined) return forbidden();
    room.deletedAt = stamp(Temporal.Now.instant());
    tell(id, { type: "gone", reason: "deleted" });
    for (const c of sockets.get(id) ?? []) c.close(4001, "deleted");
    return HttpResponse.json<Answer<InRoom["delete"]>>({});
  }),
  http.post("/api/rooms/:roomId/restore", ({ params }) => {
    // a room that is not deleted resolves nobody here, as the Worker's membership check has it
    const room = find(params.roomId);
    if (room?.deletedAt == null) return forbidden();
    room.deletedAt = null;
    return HttpResponse.json<Answer<InRoom["restore"]>>({});
  }),
  // Yuki owns every room here, so she may have a deleted one gone for good
  http.post("/api/rooms/:roomId/purge", ({ params }) => {
    const id = parseRoomId(params.roomId);
    if (id === null || rooms.get(id)?.deletedAt == null) return forbidden();
    rooms.delete(id);
    return HttpResponse.json<Answer<InRoom["purge"]>>({});
  }),
  // nobody has invited Yuki anywhere
  http.post("/api/invitations/:roomId/:answer", notFound),
];

// ---- the person's trips ----

const mine = [
  http.post("/api/me", () => {
    const entries = [...rooms];
    return HttpResponse.json<Answer<Calls["me"]>>({
      // the one person the mocks sign in, as dev-access.mjs names the one on a laptop
      email: v.parse(EmailSchema, "dev@localhost"),
      rooms: entries.flatMap(([id, r]) => (r.deletedAt === null ? [summary(id, r)] : [])),
      invitations: [],
      deleted: entries.flatMap(([id, r]) =>
        r.deletedAt === null ? [] : [{ id, name: r.state.trip.name, deletedAt: r.deletedAt }],
      ),
    });
  }),
  http.post("/api/rooms", async ({ request }) => {
    // checked as the Worker checks them
    const body = v.safeParse(
      v.object({ trip: NewTripSchema, me: ProfileSchema }),
      await request.json(),
    );
    const id = parseRoomId(crypto.randomUUID());
    if (!body.success || id === null) return badRequest();
    const { trip, me } = body.output;
    const creator: Member = { id: YUKI, kind: "person", role: "owner", ...me };
    rooms.set(id, {
      state: {
        notes: [],
        trip: reviveTrip(trip),
        members: [creator, ...mockMembers().filter((m) => m.id === CLAUDE)],
      },
      invited: [],
      deletedAt: null,
      images: new Map(),
      publication: null,
    });
    return HttpResponse.json<Answer<Calls["rooms"]>>({ roomId: id, memberId: YUKI });
  }),
];

export const handlers = [roomSocket, ...agent, ...publishing, ...members, ...mine];
