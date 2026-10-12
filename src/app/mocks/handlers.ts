import { Temporal } from "temporal-polyfill-lite";

import { http, HttpResponse, ws, type WebSocketHandlerConnection } from "msw";

import { isRecord } from "../shared/record";

import {
  parseCid,
  parseMutation,
  parsePoint,
  parseProfile,
  parseTrip,
  type ServerMessage,
  type WireMutation,
  type WireNote,
} from "../../../worker/wire";
import { SEATS, type Member } from "../features/members/types";
import type { NoteId } from "../features/notes/id";
import type { Note } from "../features/notes/types";
import { isShortMapsLink } from "../features/place/google-maps";
import { roomId, type RoomId } from "../features/rooms/types";
import { applyToRoom, type RoomState } from "../features/sync/ledger";
import { reviveMember, reviveMutation, reviveNote, reviveTrip } from "../features/sync/wire";
import type { TripSnapshot } from "../features/trip/types";

import { CLAUDE, mockMembers, YUKI } from "./members";
import { mockNotes } from "./notes";
import { mockTrip } from "./trip";

/**
 * The Worker and its rooms, in the page: what `/api` answers and what a room's socket says,
 * for the app to run as it does against the real ones. The person signed in is always Yuki,
 * the owner of the trip seeded here. Nothing is kept: a reload starts from the seed again.
 */

interface MockRoom {
  state: RoomState & { trip: TripSnapshot };
  invited: string[];
  deletedAt: string | null;
  images: Map<string, Blob>;
}

/** The seeded trip's room */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
export const MOCK_ROOM = "7a1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" as RoomId;

const rooms = new Map<RoomId, MockRoom>([
  [
    MOCK_ROOM,
    {
      state: { notes: mockNotes(), trip: mockTrip(), members: mockMembers() },
      invited: [],
      deletedAt: null,
      images: new Map(),
    },
  ],
]);

/** The app's values as they cross the wire: Temporal values as their ISO strings */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the app's own values, as the wire writes them
const wire = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

const forbidden = () => new HttpResponse(null, { status: 403 });
const notFound = () => new HttpResponse(null, { status: 404 });
const badRequest = () => new HttpResponse(null, { status: 400 });
const now = () => Temporal.Now.instant();

/** The room a request names, if there is one and it is not deleted */
/** The trip's candidate tags, as the agent would have proposed them */
const CANDIDATES = ["Airport", "Souvenirs", "Night markets", "Temples", "Tea"];

const open = (id: unknown) => {
  const room = find(id);
  return room?.deletedAt === null ? room : undefined;
};

/** The room a request names, deleted or not */
const find = (id: unknown) => {
  const room = roomId(id);
  return room === null ? undefined : rooms.get(room);
};

/** A field of a request's JSON body, when it is a string */
const textOf = (body: unknown, field: string): string | null => {
  const v = isRecord(body) ? body[field] : null;
  return typeof v === "string" ? v : null;
};

const summary = (id: RoomId, { state }: MockRoom) => ({
  id,
  name: state.trip.name,
  first: state.trip.days[0]?.date.toString() ?? null,
  days: state.trip.days.length,
  // the people first, the creator leading; the agent after them
  members: [...state.members]
    .sort((a, b) => Number(a.kind === "agent") - Number(b.kind === "agent"))
    .map(({ kind, name, color }) => ({ kind, name, color })),
  memos: state.notes.filter((n) => n.kind === "memo").length,
  owner: true,
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
  const id = roomId(params.roomId);
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
    members: wire(room.state.members),
    trip: wire(room.state.trip),
    notes: wire(room.state.notes),
  });

  client.addEventListener("message", (e) => {
    if (typeof e.data !== "string") return;
    const sent: unknown = JSON.parse(e.data);
    const cid = parseCid(sent);
    const at = now();
    // checked, and a new note stamped with whose it is and when, as the Worker's room does
    const mutation = parseMutation(sent, { by: YUKI, updatedAt: at.toString() });
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
    tell(id, { type: "mutation", mutation, by: YUKI, updatedAt: at.toString() }, client);
    if (cid !== null) send(client, { type: "ack", cid, updatedAt: at.toString() });
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
    return HttpResponse.json({
      by: CLAUDE,
      reason: "Given the locations and opening hours, this order means the least walking.",
      intro: "Xiaolongbao for lunch, Jiufen in the evening, then beer in Xinyi.",
      items: items.map((id, i) => ({ id, time: SLOTS[i] ?? null })),
    });
  }),
  http.post("/api/rooms/:roomId/suggest", async ({ params, request }) => {
    const id = roomId(params.roomId);
    const room = open(params.roomId);
    if (id === null || room === undefined) return forbidden();
    const body: unknown = await request.json();
    const at = parsePoint(isRecord(body) ? body.at : null);
    if (at === null) return badRequest();
    // the note asked from must still be on the desk, as the Worker checks
    const about = isRecord(body) ? body.about : undefined;
    if (about !== undefined && !room.state.notes.some((n) => n.id === about)) {
      return new HttpResponse("Not Found", { status: 404 });
    }
    await wait(THINKING_MS);
    const titles = ["Night view from Elephant Mountain", "Beef noodles at Yongkang Street"];
    const updatedAt = now().toString();
    titles.forEach((title, i) => {
      const note: WireNote = {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
        id: crypto.randomUUID() as NoteId,
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
    return HttpResponse.json({ added: titles.length });
  }),
  http.post("/api/rooms/:roomId/tags", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const body: unknown = await request.json();
    const chosen = isRecord(body) && Array.isArray(body.chosen) ? body.chosen : [];
    const inUse = new Set(room.state.notes.flatMap((n) => (n.kind === "memo" ? n.tags : [])));
    // every tag judged, the likeliest first: the in-use ones, then the trip's candidates
    const tags = [...inUse, ...CANDIDATES.filter((t) => !inUse.has(t))].filter(
      (t) => !chosen.includes(t),
    );
    return HttpResponse.json({
      tags: tags.map((tag, i) => ({ tag, p: 0.9 * 0.8 ** i, isNew: !inUse.has(tag) })),
    });
  }),
  http.post("/api/rooms/:roomId/candidates", ({ params }) =>
    open(params.roomId) === undefined ? forbidden() : HttpResponse.json({ tags: CANDIDATES }),
  ),
  // the typed name as one place near the trip's center, as OpenStreetMap would find it
  http.post("/api/rooms/:roomId/find", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const query = textOf(await request.json(), "query");
    if (query === null) return badRequest();
    const { lat, lng } = room.state.trip.center;
    return HttpResponse.json({
      places: [{ name: query.trim(), address: "臺北市, 臺灣", lat, lng, hours: null }],
    });
  }),
  // a short link leads to a point near the trip's center, as maps.app.goo.gl's redirect would;
  // any other link comes back as it was
  http.post("/api/rooms/:roomId/expand", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const url = textOf(await request.json(), "url");
    if (url === null) return badRequest();
    if (!isShortMapsLink(url)) return HttpResponse.json({ url, at: null });
    const { lat, lng } = room.state.trip.center;
    return HttpResponse.json({
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
    return HttpResponse.json({
      places: [{ name: title, address: "臺北市, 臺灣", lat, lng, hours: "Mo-Su 17:00-24:00" }],
    });
  }),
  http.post("/api/rooms/:roomId/where", ({ params }) =>
    open(params.roomId) === undefined ? forbidden() : HttpResponse.json({ place: null }),
  ),
  http.post("/api/rooms/:roomId/images", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const id = crypto.randomUUID();
    room.images.set(id, await request.blob());
    return HttpResponse.json({ id });
  }),
  http.get("/api/rooms/:roomId/images/:id", ({ params }) => {
    const image = open(params.roomId)?.images.get(String(params.id));
    return image === undefined ? notFound() : new HttpResponse(image);
  }),
];

// ---- who is in ----

const members = [
  http.post("/api/rooms/:roomId/invited", ({ params }) => {
    const room = open(params.roomId);
    return room === undefined ? forbidden() : HttpResponse.json({ invited: room.invited });
  }),
  http.post("/api/rooms/:roomId/invite", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const email = textOf(await request.json(), "email");
    if (email === null) return badRequest();
    const people = room.state.members.filter((m) => m.kind === "person").length;
    if (people + room.invited.length >= SEATS || room.invited.includes(email))
      return new HttpResponse(null, { status: 409 });
    room.invited = [...room.invited, email];
    return HttpResponse.json({ invited: email });
  }),
  http.post("/api/rooms/:roomId/uninvite", async ({ params, request }) => {
    const room = open(params.roomId);
    if (room === undefined) return forbidden();
    const email = textOf(await request.json(), "email");
    if (email === null) return badRequest();
    if (!room.invited.includes(email)) return notFound();
    room.invited = room.invited.filter((e) => e !== email);
    return HttpResponse.json({});
  }),
  http.post("/api/rooms/:roomId/remove", async ({ params, request }) => {
    const id = roomId(params.roomId);
    const room = open(params.roomId);
    if (id === null || room === undefined) return forbidden();
    const member = textOf(await request.json(), "member");
    if (member === null) return badRequest();
    const gone = room.state.members.find((m) => m.id === member);
    if (gone?.kind !== "person" || gone.role === "owner") return forbidden();
    const left: Member[] = room.state.members.filter((m) => m !== gone);
    room.state = { ...room.state, members: left };
    tell(id, { type: "members", members: wire(left) });
    return HttpResponse.json({});
  }),
  // Yuki owns every room here, and the owner never leaves their own
  http.post("/api/rooms/:roomId/leave", () => forbidden()),
  http.post("/api/rooms/:roomId/delete", ({ params }) => {
    const id = roomId(params.roomId);
    const room = open(params.roomId);
    if (id === null || room === undefined) return forbidden();
    room.deletedAt = now().toString();
    tell(id, { type: "gone", reason: "deleted" });
    for (const c of sockets.get(id) ?? []) c.close(4001, "deleted");
    return HttpResponse.json({});
  }),
  http.post("/api/rooms/:roomId/restore", ({ params }) => {
    const room = find(params.roomId);
    if (room?.deletedAt == null) return notFound();
    room.deletedAt = null;
    return HttpResponse.json({});
  }),
  // Yuki owns every room here, so she may have a deleted one gone for good
  http.post("/api/rooms/:roomId/purge", ({ params }) => {
    const id = roomId(params.roomId);
    if (id === null || rooms.get(id)?.deletedAt == null) return forbidden();
    rooms.delete(id);
    return HttpResponse.json({});
  }),
  // nobody has invited Yuki anywhere
  http.post("/api/invitations/:roomId/:answer", () => notFound()),
];

// ---- the person's trips ----

const mine = [
  http.post("/api/me", () => {
    const entries = [...rooms];
    return HttpResponse.json({
      rooms: entries.flatMap(([id, r]) => (r.deletedAt === null ? [summary(id, r)] : [])),
      invitations: [],
      deleted: entries.flatMap(([id, r]) =>
        r.deletedAt === null ? [] : [{ id, name: r.state.trip.name, deletedAt: r.deletedAt }],
      ),
    });
  }),
  http.post("/api/rooms", async ({ request }) => {
    // checked as the Worker checks them
    const body: unknown = await request.json();
    const trip = parseTrip(isRecord(body) ? body.trip : null);
    const me = parseProfile(isRecord(body) ? body.me : null);
    const id = roomId(crypto.randomUUID());
    if (trip === null || me === null || id === null) return badRequest();
    const creator = reviveMember({ id: YUKI, kind: "person", role: "owner", ...me });
    rooms.set(id, {
      state: {
        notes: [],
        trip: reviveTrip(trip),
        members: [creator, ...mockMembers().filter((m) => m.id === CLAUDE)],
      },
      invited: [],
      deletedAt: null,
      images: new Map(),
    });
    return HttpResponse.json({ roomId: id });
  }),
];

export const handlers = [roomSocket, ...agent, ...members, ...mine];
