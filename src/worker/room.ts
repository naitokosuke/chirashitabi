import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";

import type { CurrencyCode, HexColor, Result } from "../contract";
import { airportCodeOf, parseAirportCode } from "../contract/airport";
import { ImageIdSchema, type ImageId } from "../contract/image";
import { MemberIdSchema, parseMemberId, type MemberId } from "../contract/member";
import { NoteIdSchema, type NoteId } from "../contract/note";
import type { HttpUrl } from "../contract/place";
import {
  HEARTBEAT,
  KEPT_DAYS,
  RATE,
  RoomIdSchema,
  SEATS,
  parseTag,
  type NoteColor,
  type NoteStatus,
  type RoomId,
  type Tag,
} from "../contract/room";
import {
  COORD,
  IsoDateSchema,
  IsoInstantSchema,
  type Cid,
  type IsoDate,
  type IsoDateTime,
  type IsoInstant,
  type IsoTime,
  type ImageType,
  type Lang,
  type RejectReason,
  type UnreadReason,
  MAX_MESSAGE_BYTES,
  parseCid,
  parseMutation,
  type ServerMessage,
  type WireMember,
  type WireBooking,
  type WireMemo,
  type WireMutation,
  type WireNote,
  type ProfileSchema,
  type WireRoomSummary,
  type WireTrip,
  type GoneReason,
  type Leg,
  type WireFlights,
  type WireStay,
} from "../contract/wire";

import { renderBooklet } from "./booklet";
import type { DraftContext, PlaceContext, SuggestContext, TagContext } from "./claude";

type MemberKind = WireMember["kind"];

/** Why no seat was held for an invitation: not the owner, every seat taken, or held for it already */
export type SeatRefusal = "not the owner" | "no seat" | "already invited";
/** Why a person was not taken out: the owner never is, only the owner takes another, or gone already */
type RemoveRefusal = "the owner" | "not theirs" | "not in";

/**
 * Why the room would not act for a member id the Worker resolved: it names no person in the
 * room's table (removed since the index was asked), or the room is deleted. The word the Worker
 * refuses anyone outside a room with, so the room's refusal is answered as that one
 */
export type Outsider = "not a member";

/** A mutation the room wrote, as it wrote it, or why it did not */
type Applied = Result<WireMutation, RejectReason>;

/**
 * A seat the room holds for an invitation, as the Worker minted it for the index to record
 * first; the index keeps whom it is for
 */
const SeatIdSchema = v.pipe(v.string(), v.uuid(), v.brand("SeatId"));
export type SeatId = v.InferOutput<typeof SeatIdSchema>;

/** A new seat's id */
export const newSeatId = (): SeatId => v.parse(SeatIdSchema, crypto.randomUUID());

/** A seat's id as the index kept it, read with its schema; null when it is not one */
export const parseSeatId = (value: unknown): SeatId | null => {
  const seat = v.safeParse(SeatIdSchema, value);
  return seat.success ? seat.output : null;
};

/** The booklet the room has up: its slug, and when it was published */
type Published = { slug: string; at: IsoInstant };

/** A deleted room: its id, kept for the day it goes for good, and when it was deleted */
type Deletion = { room_id: RoomId; at: IsoInstant };

/** The room's refusal of someone it does not act for */
const OUTSIDE: { ok: false; reason: Outsider } = { ok: false, reason: "not a member" };

type Profile = v.InferOutput<typeof ProfileSchema>;

/** A message to a member's socket, as it goes; the type checks it against what the app reads */
const encode = (message: ServerMessage): string => JSON.stringify(withPreviousBuildFields(message));

/**
 * A message as a tab still on the previous build reads it too: that build reads a `title` and a
 * `color` on every note, so a text box goes with its words as its `title` and a sticker with a
 * blank one, both on white. The app now drops both as it reads (its checks keep only a kind's own
 * fields). It is here for tabs left open across a deploy, which would otherwise read no room
 * with a text box or a sticker in it, and can go after a release or two.
 */
const withPreviousBuildFields = (message: ServerMessage) => {
  const note = (n: WireNote) => {
    switch (n.kind) {
      case "memo":
      case "suggestion":
        return n;
      case "text":
        return { ...n, title: n.text, color: "#ffffff" };
      case "sticker":
        return { ...n, title: "", color: "#ffffff" };
    }
  };
  if (message.type === "snapshot") return { ...message, notes: message.notes.map(note) };
  if (message.type === "mutation" && message.mutation.type === "note:add")
    return { ...message, mutation: { ...message.mutation, note: note(message.mutation.note) } };
  return message;
};

/**
 * The cids of a member's changes the room remembers, newest kept: a phone that lost an ack
 * resends the change, and is answered without writing it again. More than a socket ever has in
 * flight when it drops, offline replays included.
 */
const APPLIED_KEPT = 1000;

type NoteRow = {
  id: NoteId;
  kind: WireNote["kind"];
  /** Paper's title, a text box's words, blank for a sticker; `color` is white for all but paper (faceColumns) */
  title: string;
  color: NoteColor;
  x: number;
  y: number;
  rot: number;
  scale: number;
  by: MemberId;
  updated_at: IsoInstant;
  body: string;
  tags: string;
  maps_url: HttpUrl | null;
  pin_lat: number | null;
  pin_lng: number | null;
  sched_date: IsoDate | null;
  sched_time: IsoTime | null;
  sched_status: NoteStatus | null;
  budget: number | null;
  checked: number;
  image: ImageId | null;
  minutes: number | null;
  hours: string | null;
  link: HttpUrl | null;
  booking_state: WireBooking["state"] | null;
  booking_by: IsoDate | null;
  booking_code: string | null;
  booking_url: HttpUrl | null;
  due: IsoDate | null;
  assignee: MemberId | null;
};

/**
 * A room: one trip, its notes, and the people and agent working on it. Holds
 * its member table keyed by member id; the Worker resolves the caller's e-mail
 * to an id in the index before anything reaches here, and the room acts only
 * for ids in its table. People and agents share the table, but only `create`
 * makes an agent: nobody can be invited as one.
 *
 * Every change arrives as a mutation over a member's socket. The room checks
 * it, stamps `by` and `updatedAt` itself, writes it, and tells the other sockets.
 */
export class Room extends DurableObject<Env> {
  static readonly MAX_PEOPLE = SEATS;
  // the one id that is the same in every room
  static readonly AGENT_ID = v.parse(MemberIdSchema, "agent:claude");
  static readonly MEMBER_HEADER = "X-Chirashitabi-Member";

  #rate = new Map<MemberId, { since: number; n: number }>();
  #dragRate = new Map<MemberId, { since: number; n: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // the app's heartbeat (features/sync/socket.ts), answered without waking the room
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT.ping, HEARTBEAT.pong));
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('person', 'agent')),
        creator INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        color TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trip (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL,
        currency TEXT NOT NULL,
        center_lat REAL NOT NULL,
        center_lng REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS days (
        date TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        intro TEXT NOT NULL DEFAULT ''
      );
    `);
    ctx.storage.sql.exec(notesTable("notes"));
    // Rooms made before the appendix's checks were shared gain the column once
    const cols = ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(notes)").toArray();
    if (!cols.some((c) => c.name === "checked")) {
      ctx.storage.sql.exec("ALTER TABLE notes ADD COLUMN checked INTEGER NOT NULL DEFAULT 0");
    }
    // and the pictures on cards, once they arrived
    if (!cols.some((c) => c.name === "image")) {
      ctx.storage.sql.exec("ALTER TABLE notes ADD COLUMN image TEXT");
    }
    // and how large a card is drawn, once cards could be resized
    if (!cols.some((c) => c.name === "scale")) {
      ctx.storage.sql.exec("ALTER TABLE notes ADD COLUMN scale REAL NOT NULL DEFAULT 1");
    }
    // and how long a memo takes, once the booklet said when each thing ends
    if (!cols.some((c) => c.name === "minutes")) {
      ctx.storage.sql.exec("ALTER TABLE notes ADD COLUMN minutes INTEGER");
    }
    // and when its place is open, once that was its own rather than a line of its words
    if (!cols.some((c) => c.name === "hours")) {
      ctx.storage.sql.exec("ALTER TABLE notes ADD COLUMN hours TEXT");
    }
    // and where its idea came from, once a memo could carry a page's link
    if (!cols.some((c) => c.name === "link")) {
      ctx.storage.sql.exec("ALTER TABLE notes ADD COLUMN link TEXT");
    }
    // and whether it has to be booked, once bookings were kept
    if (!cols.some((c) => c.name === "booking_state")) {
      for (const col of ["booking_state", "booking_by", "booking_code", "booking_url"])
        ctx.storage.sql.exec(`ALTER TABLE notes ADD COLUMN ${col} TEXT`);
    }
    // and a to-do's day and who is to do it, once there were to-dos
    if (!cols.some((c) => c.name === "due")) {
      for (const col of ["due", "assignee"])
        ctx.storage.sql.exec(`ALTER TABLE notes ADD COLUMN ${col} TEXT`);
    }
    // and text boxes and stickers, once there were any: a CHECK cannot be altered, so the table
    // is copied once into one whose CHECK lets them in, every column by name
    const { sql: ddl } = ctx.storage.sql
      .exec<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notes'",
      )
      .one();
    if (!ddl.includes("'sticker'")) {
      ctx.storage.transactionSync(() => {
        const sql = ctx.storage.sql;
        sql.exec(notesTable("notes_next"));
        sql.exec(`INSERT INTO notes_next (${NOTE_COLUMNS}) SELECT ${NOTE_COLUMNS} FROM notes`);
        sql.exec("DROP TABLE notes");
        sql.exec("ALTER TABLE notes_next RENAME TO notes");
      });
    }
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS pictures (
        id TEXT PRIMARY KEY,
        by TEXT NOT NULL,
        type TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        member TEXT
      );
      CREATE TABLE IF NOT EXISTS stays (
        position INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        check_in TEXT NOT NULL,
        nights INTEGER NOT NULL,
        maps_url TEXT,
        pin_lat REAL,
        pin_lng REAL
      );
      CREATE TABLE IF NOT EXISTS deletion (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        room_id TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS publication (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        slug TEXT NOT NULL,
        by TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS applied (
        member TEXT NOT NULL,
        cid TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (member, cid)
      );
    `);
    // Rooms made before a taken seat remembered whom it let in gain the column once
    if (
      !ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(invitations)")
        .toArray()
        .some((c) => c.name === "member")
    ) {
      ctx.storage.sql.exec("ALTER TABLE invitations ADD COLUMN member TEXT");
    }
    ctx.storage.sql.exec(flightsTable("flights"));
    // flights kept when a time not known yet was written "" (its columns were NOT NULL then) are
    // copied once into a table where it is null, every column by name
    const { sql: flightsDdl } = ctx.storage.sql
      .exec<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'flights'",
      )
      .one();
    if (flightsDdl.includes("departs TEXT NOT NULL")) {
      ctx.storage.transactionSync(() => {
        const sql = ctx.storage.sql;
        sql.exec(flightsTable("flights_next"));
        sql.exec(`INSERT INTO flights_next (leg, number, from_place, to_place, departs, arrives)
          SELECT leg, number, from_place, to_place, NULLIF(departs, ''), NULLIF(arrives, '')
          FROM flights`);
        sql.exec("DROP TABLE flights");
        sql.exec("ALTER TABLE flights_next RENAME TO flights");
      });
    }
    // a flight kept before its airports had to be codes on the list: one it names by a code in
    // another case, a name or a Japanese name becomes that code; one it names by nothing on the
    // list stays as written, out of the snapshot (trip()), until a member sets it again
    for (const f of ctx.storage.sql
      .exec<{ leg: string; from_place: string; to_place: string }>(
        "SELECT leg, from_place, to_place FROM flights",
      )
      .toArray()) {
      const from = airportCodeOf(f.from_place);
      const to = airportCodeOf(f.to_place);
      if (from === null || to === null) continue;
      if (from !== f.from_place || to !== f.to_place)
        ctx.storage.sql.exec(
          "UPDATE flights SET from_place = ?, to_place = ? WHERE leg = ?",
          from,
          to,
          f.leg,
        );
    }
  }

  // ---- pictures (RPC from the Worker; the bytes are in R2, the room keeps which it has) ----

  /** Pictures a room keeps at most; each is at most MAX_IMAGE_BYTES */
  static readonly MAX_IMAGES = 100;

  /**
   * How long a picture no card shows is kept: its form may still be open, or the card that
   * shows it may still be on its way from a device that was offline
   */
  static readonly UNUSED_AFTER = 24 * 60 * 60 * 1000;

  /**
   * Takes a picture member `by` is uploading into room `roomId`'s list, before its bytes are
   * written; the Worker has checked its type and size. Pictures no card shows, kept longer than
   * UNUSED_AFTER, go first, so a deleted card or a replaced photo gives its place back. Returns
   * its id, or why not: the room already holds as many as it may.
   */
  async addImage(
    by: MemberId,
    roomId: RoomId,
    type: ImageType,
    bytes: number,
  ): Promise<Result<ImageId, "full" | Outsider>> {
    if (this.outsider(by)) return OUTSIDE;
    const sql = this.ctx.storage.sql;
    // off the list before the bytes go, so no card can take a picture whose bytes are going
    const unused = sql
      .exec<{ id: ImageId }>(
        `DELETE FROM pictures
         WHERE created_at < ? AND id NOT IN (
           SELECT image FROM ${ON_DESK} WHERE image IS NOT NULL
         )
         RETURNING id`,
        new Date(Date.now() - Room.UNUSED_AFTER).toISOString(),
      )
      .toArray()
      .map((p) => `rooms/${roomId}/images/${p.id}`);
    // R2 deletes up to 1000 keys a call; a room holds at most MAX_IMAGES
    if (unused.length > 0) await this.env.IMAGES.delete(unused);
    // deleted while the old pictures went: nothing more is written
    if (this.outsider(by)) return OUTSIDE;
    if (sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM pictures").one().n >= Room.MAX_IMAGES)
      return { ok: false, reason: "full" };
    const id = v.parse(ImageIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO pictures (id, by, type, bytes, created_at) VALUES (?, ?, ?, ?, ?)",
      id,
      by,
      type,
      bytes,
      new Date().toISOString(),
    );
    return { ok: true, value: id };
  }

  /** Its bytes could not be written: the room does not have it after all */
  dropImage(id: ImageId): void {
    this.ctx.storage.sql.exec("DELETE FROM pictures WHERE id = ?", id);
  }

  /** Whether the room has a picture by that id, asked for member `by` */
  hasImageFor(by: MemberId, id: ImageId): Result<boolean, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    return { ok: true, value: this.hasImage(id) };
  }

  private hasImage(id: ImageId): boolean {
    return (
      this.ctx.storage.sql.exec("SELECT 1 FROM pictures WHERE id = ?", id).toArray().length > 0
    );
  }

  // ---- the public booklet (RPC from the Worker; its file is in R2, the room keeps its slug) ----

  /** The booklet the room has published, asked by member `by`: its slug and when; null for none */
  publication(by: MemberId): Result<Published | null, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    return { ok: true, value: this.published() };
  }

  /**
   * The owner `by` publishes the booklet as it is now, in `lang`, under a fresh slug, and the
   * one before goes: publishing again is how a link that went too far is taken back. The page
   * is written here from the room's own data (booklet.ts), so nothing a browser sends is on it.
   */
  async publish(by: MemberId, lang: Lang): Promise<Result<Published, "not the owner" | Outsider>> {
    if (this.outsider(by)) return OUTSIDE;
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    // nothing else runs until the record names the file put up: two publishes at once (a double
    // tap), or a withdrawal or a deletion between, would leave up a file no record names
    return this.ctx.blockConcurrencyWhile(async () => {
      // the old file goes first: should anything after fail, the old link answers nothing, and the
      // record still names a slug whose file a retry deletes again (an R2 delete of none is fine)
      const before = this.published();
      if (before !== null) await this.env.IMAGES.delete(bookletKey(before.slug));
      const slug = newSlug();
      const at = stamp();
      await this.env.IMAGES.put(
        bookletKey(slug),
        renderBooklet(this.trip(), this.notes(), lang, at),
        {
          httpMetadata: { contentType: "text/html; charset=utf-8" },
        },
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO publication (id, slug, by, at) VALUES (1, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, by = excluded.by, at = excluded.at`,
        slug,
        by,
        at,
      );
      return { ok: true, value: { slug, at } };
    });
  }

  /** The owner `by` takes the booklet down: its link answers nothing from now on */
  async withdraw(by: MemberId): Promise<Result<void, "not the owner" | Outsider>> {
    if (this.outsider(by)) return OUTSIDE;
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    // one at a time with a publish, as there
    await this.ctx.blockConcurrencyWhile(() => this.unpublish());
    return { ok: true, value: undefined };
  }

  /**
   * The published booklet goes, its file before its record: if the file cannot be deleted, the
   * record still names it, and the next try (or the alarm's) deletes it
   */
  private async unpublish(): Promise<void> {
    const p = this.published();
    if (p === null) return;
    await this.env.IMAGES.delete(bookletKey(p.slug));
    this.ctx.storage.sql.exec("DELETE FROM publication");
  }

  private published(): Published | null {
    const row = this.ctx.storage.sql
      .exec<{ slug: string; at: string }>("SELECT slug, at FROM publication")
      .toArray()[0];
    return row === undefined ? null : { slug: row.slug, at: v.parse(IsoInstantSchema, row.at) };
  }

  // ---- membership (RPC from the Worker) ----

  /** Sets the trip up, mints the creator and the room's agent; returns the creator's id */
  create(trip: WireTrip, me: Profile): MemberId {
    if (this.count() > 0) throw new Error("room already created");
    const sql = this.ctx.storage.sql;
    const creator = v.parse(MemberIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO members (id, kind, creator, name, color) VALUES (?, 'person', 1, ?, ?)",
      creator,
      me.name,
      me.color,
    );
    sql.exec(
      "INSERT INTO members (id, kind, name, color) VALUES (?, 'agent', 'Claude', '#d97757')",
      Room.AGENT_ID,
    );
    sql.exec(
      "INSERT INTO trip (id, name, currency, center_lat, center_lng) VALUES (1, ?, ?, ?, ?)",
      trip.name,
      trip.currency,
      trip.center.lat,
      trip.center.lng,
    );
    trip.days.forEach((d, i) =>
      sql.exec("INSERT INTO days (date, position) VALUES (?, ?)", d.date, i),
    );
    return creator;
  }

  /**
   * The index would not record the room `create` just set up (its maker at their cap): nothing of
   * it is kept. It has no pictures, booklet or alarm yet, so its storage is all there is.
   */
  async discard(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  /**
   * Whether the room acts for `by`, for a call that reads nothing else of it (a lookup, a fetch)
   * and so would otherwise go on the index's word alone, which may be behind
   */
  admits(by: MemberId): Result<void, Outsider> {
    return this.outsider(by) ? OUTSIDE : { ok: true, value: undefined };
  }

  /** Who made the room and so may invite, remove and delete; asked by member `by` */
  owner(by: MemberId): Result<MemberId, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    return { ok: true, value: this.ownerId() };
  }

  /**
   * How long a held seat the index does not list is kept: an invitation is recorded in the index
   * before its seat is held here, so one the index has not listed for this long was given back
   * there and lost here (a call that failed part way), and goes
   */
  static readonly UNLISTED_FOR = 60_000;

  /**
   * Holds the seat `seat` for someone the owner `by` invites, until they answer or the owner
   * takes it back; `listed` are the seats the index has invitations to. Refused when `by` is not
   * the owner, when every seat is taken or held (a held seat the index lost is given back first),
   * or when the seat is held already: asked again after a try whose answer was lost. The index
   * keeps who the seat is for; the room keeps no e-mail.
   */
  openSeat(by: MemberId, seat: SeatId, listed: SeatId[]): Result<void, SeatRefusal | Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    const sql = this.ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM invitations WHERE id = ?", seat).toArray().length > 0)
      return { ok: false, reason: "already invited" };
    const lost = new Date(Date.now() - Room.UNLISTED_FOR).toISOString();
    const known = new Set<string>(listed);
    for (const { id } of sql
      .exec<{ id: string }>(
        "SELECT id FROM invitations WHERE member IS NULL AND created_at < ?",
        lost,
      )
      .toArray())
      if (!known.has(id)) sql.exec("DELETE FROM invitations WHERE id = ?", id);
    const held = sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM invitations WHERE member IS NULL")
      .one().n;
    if (this.count("person") + held >= Room.MAX_PEOPLE) return { ok: false, reason: "no seat" };
    sql.exec(
      "INSERT INTO invitations (id, created_at) VALUES (?, ?)",
      seat,
      new Date().toISOString(),
    );
    return { ok: true, value: undefined };
  }

  /**
   * The seat is given back: declined, withdrawn, or not recorded after all. One taken by someone
   * the index never recorded (an acceptance that failed part way) takes them out with it, as
   * `unaccept` does; one given back already is nothing to give.
   */
  closeSeat(id: SeatId): void {
    const sql = this.ctx.storage.sql;
    const held = sql
      .exec<{ member: string | null }>("SELECT member FROM invitations WHERE id = ?", id)
      .toArray()[0];
    if (held === undefined) return;
    const taken = held.member === null ? null : this.person(held.member);
    if (taken === null) sql.exec("DELETE FROM invitations WHERE id = ?", id);
    else this.unaccept(taken);
  }

  /**
   * The invited person takes their seat as who they say they are; returns their new member id,
   * or why not: the seat is gone (withdrawn), or the room deleted. Everyone in is told. The seat
   * remembers whom it let in, so asked again for it (the index not told the first time) it
   * answers that member again rather than "no seat".
   */
  accept(seat: SeatId, me: Profile): Result<MemberId, "no seat" | "deleted"> {
    if (this.deletion() !== null) return { ok: false, reason: "deleted" };
    const sql = this.ctx.storage.sql;
    const held = sql
      .exec<{ member: string | null }>("SELECT member FROM invitations WHERE id = ?", seat)
      .toArray()[0];
    if (held === undefined) return { ok: false, reason: "no seat" };
    if (held.member !== null) {
      const taken = this.person(held.member);
      return taken === null ? { ok: false, reason: "no seat" } : { ok: true, value: taken };
    }
    const id = v.parse(MemberIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO members (id, kind, name, color) VALUES (?, 'person', ?, ?)",
      id,
      me.name,
      me.color,
    );
    sql.exec("UPDATE invitations SET member = ? WHERE id = ?", id, seat);
    this.tellMembers();
    return { ok: true, value: id };
  }

  /**
   * The index would not record a member `accept` let in, or their invitation was given back
   * before it did: they are not in, and the seat is lost
   */
  unaccept(member: MemberId): void {
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM members WHERE id = ? AND creator = 0", member);
    sql.exec("DELETE FROM invitations WHERE member = ?", member);
    this.tellMembers();
  }

  /**
   * A deleted room as a person in it sees it, to restore it; null for anyone else, or when it
   * is not deleted. Only the owner deletes, but either person can take it back for its thirty
   * days, unless the owner has it gone at once (docs/auth-and-security.md).
   */
  deletedFor(by: MemberId): { name: string; deletedAt: IsoInstant } | null {
    const deletion = this.deletion();
    if (deletion === null || this.person(by) === null) return null;
    const { name } = this.ctx.storage.sql
      .exec<{ name: string }>("SELECT name FROM trip WHERE id = 1")
      .one();
    return { name, deletedAt: deletion.at };
  }

  /**
   * Takes `member` out: the owner `by` removing someone else, or someone other than the owner
   * leaving (`by` is `member`). Refused for anything else; the owner never leaves their own
   * room, they delete it. Their notes stay; their socket is told and closed. Someone leaving
   * again, out already (the index not told the first time), is answered as having left.
   */
  remove(by: MemberId, member: MemberId): Result<void, RemoveRefusal | Outsider> {
    if (by === member && this.person(by) === null && this.deletion() === null)
      return { ok: true, value: undefined };
    if (this.outsider(by)) return OUTSIDE;
    const owner = this.ownerId();
    if (member === owner) return { ok: false, reason: "the owner" };
    if (by !== owner && by !== member) return { ok: false, reason: "not theirs" };
    const sql = this.ctx.storage.sql;
    const gone = sql
      .exec("DELETE FROM members WHERE id = ? AND kind = 'person' RETURNING id", member)
      .toArray();
    if (gone.length === 0) return { ok: false, reason: "not in" };
    this.#rate.delete(member);
    this.#dragRate.delete(member);
    sql.exec("DELETE FROM applied WHERE member = ?", member);
    sql.exec("DELETE FROM invitations WHERE member = ?", member);
    this.closeSockets(this.ctx.getWebSockets(member), by === member ? "left" : "removed");
    this.tellMembers();
    return { ok: true, value: undefined };
  }

  /**
   * The owner `by` deletes the room: nobody can open it from now on, and in DELETE_AFTER it is
   * gone for good unless the owner restores it. `roomId` is kept for that day, when its pictures
   * go too. Refused when `by` is not the owner. Asked again after a try that failed part way
   * (the index not told), it keeps the first deletion's time and does the rest again.
   */
  async delete(by: MemberId, roomId: RoomId): Promise<Result<void, "not the owner" | Outsider>> {
    if (this.person(by) === null) return OUTSIDE;
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    const sql = this.ctx.storage.sql;
    // deleted before anything is awaited: from here on nothing is written, opened or published
    sql.exec("INSERT OR IGNORE INTO deletion (id, room_id, at) VALUES (1, ?, ?)", roomId, stamp());
    sql.exec("DELETE FROM invitations");
    this.closeSockets(this.ctx.getWebSockets(), "deleted");
    const { at } = sql.exec<{ at: string }>("SELECT at FROM deletion").one();
    await this.ctx.storage.setAlarm(Date.parse(at) + Room.DELETE_AFTER);
    // a deleted trip's booklet is not left up for its thirty days; restoring does not bring it back
    await this.unpublish();
    return { ok: true, value: undefined };
  }

  /** How long a deleted room can be restored: KEPT_DAYS, in milliseconds */
  static readonly DELETE_AFTER = KEPT_DAYS * 24 * 60 * 60 * 1000;

  /** When the room was deleted, or null while it is not */
  deletedAt(): IsoInstant | null {
    return this.deletion()?.at ?? null;
  }

  /**
   * A person in the room, `by`, takes the deletion back; refused when it is not deleted, which,
   * asked while the index still hides the room, means a try whose index call failed restored it,
   * and refused for anyone else
   */
  restore(by: MemberId): Result<void, "not deleted" | Outsider> {
    if (this.deletion() === null) return { ok: false, reason: "not deleted" };
    if (this.person(by) === null) return OUTSIDE;
    this.ctx.storage.sql.exec("DELETE FROM deletion");
    void this.ctx.storage.deleteAlarm();
    return { ok: true, value: undefined };
  }

  /**
   * A deleted room's day has come: its pictures, its place in the index and its storage go.
   * Alarms do nothing else (docs/auth-and-security.md); none of this is a paid call.
   */
  override async alarm(): Promise<void> {
    await this.sweep();
  }

  /** What the alarm does, callable on its own so the tests need not wait thirty days */
  async sweep(): Promise<void> {
    const deletion = this.deletion();
    if (deletion === null) return;
    const due = Date.parse(deletion.at) + Room.DELETE_AFTER;
    if (Date.now() < due) {
      await this.ctx.storage.setAlarm(due);
      return;
    }
    await this.erase(deletion);
  }

  /**
   * The owner `by` wants the deleted room gone now rather than on its day: it goes as the
   * alarm would take it. Refused unless the room is deleted and `by` owns it; the other person
   * could still have restored it, so only the one who deleted it may end that.
   */
  async purge(by: MemberId): Promise<Result<void, "not deleted" | "not the owner">> {
    const deletion = this.deletion();
    if (deletion === null) return { ok: false, reason: "not deleted" };
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    await this.erase(deletion);
    return { ok: true, value: undefined };
  }

  /**
   * The room goes for good: its pictures, its place in the index, its storage. Nothing else runs
   * until it is gone: a restore in between would be answered yes for a room about to go.
   */
  private erase(deletion: Deletion): Promise<void> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const keys = this.ctx.storage.sql
        .exec<{ id: ImageId }>("SELECT id FROM pictures")
        .toArray()
        .map((p) => `rooms/${deletion.room_id}/images/${p.id}`);
      // R2 deletes up to 1000 keys a call; a room holds at most MAX_IMAGES
      if (keys.length > 0) await this.env.IMAGES.delete(keys);
      await this.unpublish();
      await this.env.ROOMS.getByName("index").drop(deletion.room_id);
      await this.ctx.storage.deleteAll();
    });
  }

  /** The room's deletion as `delete` wrote it, read with its schemas; null while it is not deleted */
  private deletion(): Deletion | null {
    const row = this.ctx.storage.sql
      .exec<{ room_id: string; at: string }>("SELECT room_id, at FROM deletion")
      .toArray()[0];
    return row === undefined
      ? null
      : { room_id: v.parse(RoomIdSchema, row.room_id), at: v.parse(IsoInstantSchema, row.at) };
  }

  private ownerId(): MemberId {
    return this.ctx.storage.sql
      .exec<{ id: MemberId }>("SELECT id FROM members WHERE creator = 1")
      .one().id;
  }

  /** Who is in the room now, to every socket */
  private tellMembers(): void {
    const out = encode({
      type: "members",
      members: this.members(),
    });
    // a socket just closed on someone removed is still listed, and takes nothing more
    for (const ws of this.ctx.getWebSockets()) if (ws.readyState === WebSocket.OPEN) ws.send(out);
  }

  private closeSockets(sockets: WebSocket[], reason: GoneReason): void {
    const out = encode({ type: "gone", reason });
    for (const ws of sockets) {
      // one closed already (someone removed, still listed while it closes) would throw on send
      if (ws.readyState !== WebSocket.OPEN) continue;
      ws.send(out);
      ws.close(4001, reason);
    }
  }

  /**
   * The trip at a glance, for a member's list of rooms: its name, days, members and memo count;
   * for `by`, a person in it, or for an invitation (null). Null when `by` is not in the room (an
   * index row the room no longer honours), so the list leaves the room out
   */
  summary(by: MemberId | null = null): WireRoomSummary | null {
    if (by !== null && this.person(by) === null) return null;
    const sql = this.ctx.storage.sql;
    const { name } = sql.exec<{ name: string }>("SELECT name FROM trip WHERE id = 1").one();
    // a trip always has a day: made with one, and moved to one at least
    const { first } = sql
      .exec<{ first: IsoDate }>("SELECT date AS first FROM days ORDER BY position LIMIT 1")
      .one();
    const { days } = sql.exec<{ days: number }>("SELECT COUNT(*) AS days FROM days").one();
    // the people first, the creator leading; the agent after them
    const members = this.members()
      .sort((a, b) => Number(a.kind === "agent") - Number(b.kind === "agent"))
      .map(({ kind, name, color }) => ({ kind, name, color }));
    const { memos } = sql
      .exec<{ memos: number }>(`SELECT COUNT(*) AS memos FROM ${ON_DESK} WHERE kind = 'memo'`)
      .one();
    const owner = by !== null && by === this.ownerId();
    return { name, members, memos, owner, first, days };
  }

  // ---- the agent (RPC from the Worker, inside a member's request) ----

  /** What the agent needs to draft `date`, asked by member `by`; null when the trip has no such day */
  dayForDraft(by: MemberId, date: IsoDate): Result<DraftContext | null, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const trip = this.trip();
    if (!trip.days.some((d) => d.date === date)) return { ok: true, value: null };
    const notes = this.notes()
      .filter((n) => n.kind === "memo")
      .filter((n) => n.schedule?.date === date);
    return { ok: true, value: { trip: trip.name, currency: trip.currency, date, notes } };
  }

  // ---- places: where a memo is ----

  /** What naming a memo's place needs, asked by member `by`: which trip, and when */
  placeContext(by: MemberId): Result<PlaceContext, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const trip = this.trip();
    return { ok: true, value: { trip: trip.name, days: trip.days.map((d) => d.date) } };
  }

  // ---- tags: the ones in use, and the agent's candidates for the trip ----

  /** What tagging a memo needs, asked by member `by`: the trip, the tags in use, the candidates */
  tagContext(by: MemberId): Result<TagContext & { candidates: string[] }, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const trip = this.trip();
    const notes = this.notes();
    const tags = [...new Set(notes.flatMap((n) => (n.kind === "memo" ? n.tags : [])))];
    return {
      ok: true,
      value: {
        trip: trip.name,
        days: trip.days.map((d) => d.date),
        tags,
        // what is written on paper: a text box's words are a label on the desk, not a plan
        titles: notes.flatMap((n) => (n.kind === "memo" || n.kind === "suggestion" ? n.title : [])),
        candidates: this.candidates(),
      },
    };
  }

  /**
   * How long a proposal of the candidates is waited for: one asked for longer ago was never
   * answered (its request died, or what came back was paid for and no proposal), and the next
   * ask may propose them
   */
  static readonly PROPOSING_FOR = 60_000;

  /**
   * Whether member `by` is the one to have the agent propose the trip's candidate tags: yes once
   * a trip, to the first who asks, and to nobody else while that proposal is on its way, so two
   * asks at once pay for one. Kept as proposed when it is saved, even with no tags in it; a
   * proposal that failed and was paid for is not saved, and is asked again after PROPOSING_FOR.
   * Nobody the room does not act for is the one.
   */
  claimProposal(by: MemberId): boolean {
    if (this.outsider(by)) return false;
    this.candidateTable();
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const claim = sql
      .exec<{ at: number; done: number }>("SELECT at, done FROM tag_proposal")
      .toArray()[0];
    if (this.candidates().length > 0 || claim?.done === 1) return false;
    if (claim !== undefined && now - claim.at < Room.PROPOSING_FOR) return false;
    sql.exec(
      `INSERT INTO tag_proposal (id, at, done) VALUES (1, ?, 0)
       ON CONFLICT (id) DO UPDATE SET at = excluded.at`,
      now,
    );
    return true;
  }

  /**
   * The proposal claimed spent nothing (a provider's error, or past the budget): it is not made.
   * Nothing changes for anyone the room does not act for.
   */
  releaseProposal(by: MemberId): void {
    if (this.outsider(by)) return;
    this.candidateTable();
    this.ctx.storage.sql.exec("DELETE FROM tag_proposal WHERE done = 0");
  }

  /**
   * The agent's candidate tags, from an answer that was a proposal, kept so they are proposed
   * once a trip, not on every ask; none when it held no tag to keep. Nothing is kept for anyone
   * the room does not act for.
   */
  saveCandidates(by: MemberId, tags: string[]): void {
    if (this.outsider(by)) return;
    const sql = this.ctx.storage.sql;
    this.candidateTable();
    for (const tag of tags) sql.exec("INSERT OR IGNORE INTO tag_candidates (tag) VALUES (?)", tag);
    sql.exec(
      `INSERT INTO tag_proposal (id, at, done) VALUES (1, ?, 1)
       ON CONFLICT (id) DO UPDATE SET done = 1`,
      Date.now(),
    );
  }

  private candidates(): string[] {
    this.candidateTable();
    return this.ctx.storage.sql
      .exec<{ tag: string }>("SELECT tag FROM tag_candidates ORDER BY rowid")
      .toArray()
      .map((r) => r.tag);
  }

  private candidateTable(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tag_candidates (tag TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS tag_proposal (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        at INTEGER NOT NULL,
        done INTEGER NOT NULL
      );
    `);
  }

  /**
   * What the agent reads to suggest ideas, asked by member `by` from the note `about` (or from
   * none); null when that note is not on the desk, or has no words to start from
   */
  contextForSuggest(by: MemberId, about: NoteId | null): Result<SuggestContext | null, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const trip = this.trip();
    // a sticker has no words to read
    const notes = this.notes().filter((n) => n.kind !== "sticker");
    const from = about === null ? null : notes.find((n) => n.id === about);
    if (from === undefined) return { ok: true, value: null };
    return {
      ok: true,
      value: {
        trip: trip.name,
        days: trip.days.map((d) => d.date),
        notes: notes.map((n) => ({
          title: n.kind === "text" ? n.text : n.title,
          tags: n.kind === "memo" ? n.tags : [],
          date: n.kind === "memo" ? (n.schedule?.date ?? null) : null,
        })),
        about:
          from === null
            ? null
            : {
                title: from.kind === "text" ? from.text : from.title,
                body: from.kind === "memo" ? from.body : "",
                tags: from.kind === "memo" ? from.tags : [],
                pin: from.kind === "memo" ? from.pin : null,
              },
      },
    };
  }

  /**
   * The agent's ideas as suggestion cards, written as the agent (never as the member who
   * asked) around `at` on the desk, and sent to every socket, the asker's too: nobody made
   * them on their own device. Returns how many were written.
   */
  addSuggestions(
    by: MemberId,
    titles: string[],
    at: { x: number; y: number },
  ): Result<number, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const now = stamp();
    let added = 0;
    titles.forEach((title, i) => {
      const note: WireNote = {
        id: v.parse(NoteIdSchema, crypto.randomUUID()),
        kind: "suggestion",
        title,
        color: "#ffffff",
        // a short column under where the asker was looking, slightly askew like any card, and
        // on the desk however near its edge they looked
        x: Math.min(Math.max(at.x - 82 + (i % 2 === 0 ? -12 : 12), -COORD), COORD),
        y: Math.min(Math.max(at.y - 40 + i * 120, -COORD), COORD),
        rot: Math.random() * 4 - 2,
        scale: 1,
        by: Room.AGENT_ID,
        updatedAt: now,
      };
      const result = this.apply({ type: "note:add", note }, Room.AGENT_ID, now);
      if (!result.ok) return;
      added++;
      const out = encode({
        type: "mutation",
        mutation: result.value,
        by: Room.AGENT_ID,
        updatedAt: now,
      });
      for (const ws of this.ctx.getWebSockets()) if (ws.readyState === WebSocket.OPEN) ws.send(out);
    });
    return { ok: true, value: added };
  }

  /**
   * The ledger of the agent's paid calls: who asked, when, for what and how many tokens, for
   * tracing a surprising bill. Member ids only, never an e-mail.
   */
  recordAgentCall(by: MemberId, what: string, tokens: { input: number; output: number }): void {
    const sql = this.ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS agent_calls (
        at TEXT NOT NULL,
        by TEXT NOT NULL,
        what TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL
      )
    `);
    sql.exec(
      "INSERT INTO agent_calls (at, by, what, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)",
      new Date().toISOString(),
      by,
      what,
      tokens.input,
      tokens.output,
    );
  }

  // ---- the socket ----

  /**
   * The WebSocket upgrade. A socket cannot cross an RPC call, so this is the one
   * thing that arrives as a request; the Worker has resolved the member and says
   * who it is in a header nothing outside the Worker can set.
   */
  override fetch(request: Request): Response {
    const asked = request.headers.get(Room.MEMBER_HEADER);
    if (request.headers.get("Upgrade") !== "websocket" || asked === null) {
      return new Response("Bad Request", { status: 400 });
    }
    // removed or deleted between the index's answer and here
    const memberId = this.person(asked);
    if (memberId === null || this.deletion() !== null)
      return new Response("Forbidden", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [memberId]);
    server.send(encode(this.snapshot(memberId)));
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const tag = this.ctx.getTags(ws)[0];
    const by = tag === undefined ? null : this.person(tag);
    if (by === null) return ws.close(1008, "no member");
    // sent while the room was being deleted: nothing more is written
    if (this.deletion() !== null) return this.closeSockets([ws], "deleted");
    // the client's id for this mutation, once it is known: an answer names it
    let cid: Cid | null = null;
    // what could not be read names no cid; what was read and refused names it when it had one
    const unread = (reason: UnreadReason) => ws.send(encode({ type: "unread", reason }));
    const reject = (reason: RejectReason) =>
      ws.send(
        encode({
          type: "rejected",
          reason,
          ...(cid === null ? {} : { cid }),
        }),
      );

    if (typeof message !== "string") return unread("text only");
    // its size in bytes, as the limit is; a string's length counts UTF-16 units
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES)
      return unread("too large");

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return unread("not JSON");
    }
    cid = parseCid(parsed);
    const updatedAt = stamp();
    const mutation = parseMutation(parsed, { by, updatedAt }, parseAirportCode);
    // a card on its way under a finger is relayed, not kept; letting go sends the move with a cid
    const dragging = cid === null && mutation?.type === "note:move";
    // and is not answered: one past the window, or of a card already gone, is dropped, the next
    // one or the snapshot after saying where everything is
    if (!this.withinRate(dragging ? this.#dragRate : this.#rate, by)) {
      if (!dragging) reject("too many messages");
      return;
    }
    if (mutation === null) return reject("not a mutation");

    const sql = this.ctx.storage.sql;
    // sent again by a phone that never heard the answer: answered as before, and not written over
    // what came since
    if (cid !== null) {
      const again = sql
        .exec<{ updated_at: IsoInstant }>(
          "SELECT updated_at FROM applied WHERE member = ? AND cid = ?",
          by,
          cid,
        )
        .toArray()[0];
      if (again !== undefined)
        return ws.send(encode({ type: "ack", cid, updatedAt: again.updated_at }));
    }

    if (dragging && this.note(mutation.id) === undefined) return;
    const result: Applied = dragging
      ? { ok: true, value: mutation }
      : this.apply(mutation, by, updatedAt);
    if (!result.ok) return reject(result.reason);

    if (cid !== null) {
      ws.send(encode({ type: "ack", cid, updatedAt }));
      sql.exec(
        "INSERT INTO applied (member, cid, updated_at) VALUES (?, ?, ?)",
        by,
        cid,
        updatedAt,
      );
      sql.exec(
        `DELETE FROM applied WHERE member = ? AND rowid <= (
           SELECT rowid FROM applied WHERE member = ? ORDER BY rowid DESC LIMIT 1 OFFSET ?
         )`,
        by,
        by,
        APPLIED_KEPT,
      );
    }

    const out = encode({
      type: "mutation",
      mutation: result.value,
      by,
      updatedAt,
    });
    // a socket closing (someone removed) is still listed, and would throw on send
    for (const other of this.ctx.getWebSockets())
      if (other !== ws && other.readyState === WebSocket.OPEN) other.send(out);
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    // 1005, 1006 and 1015 say what the other end could not (no code, a dropped line, TLS): none
    // may be sent, and close() throws on them
    if (![1005, 1006, 1015].includes(code)) ws.close(code, reason);
  }

  // ---- state ----

  snapshot(me: MemberId): ServerMessage {
    return {
      type: "snapshot",
      me,
      members: this.members(),
      trip: this.trip(),
      notes: this.notes(),
    };
  }

  private members(): WireMember[] {
    return this.ctx.storage.sql
      .exec<{ id: MemberId; kind: MemberKind; creator: number; name: string; color: HexColor }>(
        "SELECT id, kind, creator, name, color FROM members ORDER BY creator DESC, rowid",
      )
      .toArray()
      .map(({ id, kind, creator, name, color }) =>
        kind === "agent"
          ? { id, kind, name, color }
          : { id, kind, role: creator === 1 ? "owner" : "guest", name, color },
      );
  }

  private trip(): WireTrip {
    const sql = this.ctx.storage.sql;
    const t = sql
      .exec<{ name: string; currency: CurrencyCode; center_lat: number; center_lng: number }>(
        "SELECT name, currency, center_lat, center_lng FROM trip WHERE id = 1",
      )
      .one();
    const days = sql
      .exec<{ date: IsoDate; intro: string }>("SELECT date, intro FROM days ORDER BY position")
      .toArray();
    const flights: WireFlights = { out: null, back: null };
    for (const f of sql
      .exec<{
        leg: Leg;
        number: string;
        from_place: string;
        to_place: string;
        departs: IsoDateTime | null;
        arrives: IsoDateTime | null;
      }>("SELECT * FROM flights")
      .toArray()) {
      // only a flight between airports on the list (one kept from before stays out until set again)
      const [from, to] = [parseAirportCode(f.from_place), parseAirportCode(f.to_place)];
      if (from === null || to === null) continue;
      flights[f.leg] = {
        number: f.number,
        from,
        to,
        departs: f.departs,
        arrives: f.arrives,
      };
    }
    const stays = sql
      .exec<{
        name: string;
        check_in: IsoDate;
        nights: number;
        maps_url: HttpUrl | null;
        pin_lat: number | null;
        pin_lng: number | null;
      }>("SELECT * FROM stays ORDER BY position")
      .toArray()
      .map((s): WireStay => {
        const stay = { name: s.name, checkIn: s.check_in, nights: s.nights };
        const pin =
          s.pin_lat === null || s.pin_lng === null ? null : { lat: s.pin_lat, lng: s.pin_lng };
        // no link, no point: a pin is only ever the point a link names
        return s.maps_url === null
          ? { ...stay, mapsUrl: null, pin: null }
          : { ...stay, mapsUrl: s.maps_url, pin };
      });
    return {
      name: t.name,
      currency: t.currency,
      center: { lat: t.center_lat, lng: t.center_lng },
      days,
      flights,
      stays,
    };
  }

  private notes(): WireNote[] {
    return this.ctx.storage.sql
      .exec<NoteRow>(`SELECT * FROM ${ON_DESK} ORDER BY rowid`)
      .toArray()
      .map(fromRow);
  }

  private note(id: NoteId): NoteRow | undefined {
    return this.ctx.storage.sql
      .exec<NoteRow>(`SELECT * FROM ${ON_DESK} WHERE id = ?`, id)
      .toArray()[0];
  }

  /** Writes the mutation as `by` at `now`; returns what was written, or why it was not */
  private apply(m: WireMutation, by: MemberId, now: IsoInstant): Applied {
    const sql = this.ctx.storage.sql;
    switch (m.type) {
      case "note:add": {
        // a deleted note keeps its id
        if (sql.exec("SELECT 1 FROM notes WHERE id = ?", m.note.id).toArray().length > 0)
          return { ok: false, reason: "duplicate id" };
        const note = { ...m.note, by, updatedAt: now };
        // every other kind is kept in a memo's columns, with nothing in those it does not have
        const memo =
          note.kind === "memo"
            ? note
            : {
                body: "",
                tags: [],
                mapsUrl: null,
                pin: null,
                schedule: null,
                budget: null,
                checked: false,
                // a sticker is its picture
                image: note.kind === "sticker" ? note.image : null,
                minutes: null,
                hours: null,
                link: null,
                booking: null,
                due: null,
                assignee: null,
              };
        // a card shows only a picture the room has
        if (memo.image !== null && !this.hasImage(memo.image))
          return { ok: false, reason: "no such image" };
        sql.exec(
          `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at, body, tags, maps_url,
             pin_lat, pin_lng, sched_date, sched_time, sched_status, budget, checked, image, scale, minutes, hours,
             booking_state, booking_by, booking_code, booking_url, due, assignee, link)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          note.id,
          note.kind,
          ...faceColumns(note),
          note.x,
          note.y,
          note.rot,
          by,
          now,
          memo.body,
          JSON.stringify(memo.tags),
          memo.mapsUrl,
          memo.pin?.lat ?? null,
          memo.pin?.lng ?? null,
          memo.schedule?.date ?? null,
          memo.schedule?.time ?? null,
          memo.schedule?.status ?? null,
          memo.budget,
          memo.checked ? 1 : 0,
          memo.image,
          note.scale,
          memo.minutes,
          memo.hours,
          ...bookingColumns(memo.booking),
          memo.due,
          memo.assignee,
          memo.link,
        );
        return { ok: true, value: { type: "note:add", note } };
      }
      case "note:update": {
        const row = this.note(m.id);
        if (row === undefined) return { ok: false, reason: "no such note" };
        if (row.kind !== "memo") return { ok: false, reason: "not a memo" };
        const p = m.patch;
        const has = <K extends keyof typeof p>(k: K) => Object.hasOwn(p, k);
        if (has("image") && typeof p.image === "string" && !this.hasImage(p.image))
          return { ok: false, reason: "no such image" };
        sql.exec(
          `UPDATE notes SET
             title = ?, body = ?, tags = ?, color = ?, maps_url = ?, pin_lat = ?, pin_lng = ?,
             sched_date = ?, sched_time = ?, sched_status = ?, budget = ?, checked = ?, image = ?,
             minutes = ?, hours = ?, booking_state = ?, booking_by = ?, booking_code = ?,
             booking_url = ?, due = ?, assignee = ?, link = ?, x = ?, y = ?, rot = ?, updated_at = ?
           WHERE id = ?`,
          has("title") ? p.title : row.title,
          has("body") ? p.body : row.body,
          has("tags") ? JSON.stringify(p.tags) : row.tags,
          has("color") ? p.color : row.color,
          has("mapsUrl") ? p.mapsUrl : row.maps_url,
          has("pin") ? (p.pin?.lat ?? null) : row.pin_lat,
          has("pin") ? (p.pin?.lng ?? null) : row.pin_lng,
          has("schedule") ? (p.schedule?.date ?? null) : row.sched_date,
          has("schedule") ? (p.schedule?.time ?? null) : row.sched_time,
          has("schedule") ? (p.schedule?.status ?? null) : row.sched_status,
          has("budget") ? p.budget : row.budget,
          has("checked") ? (p.checked === true ? 1 : 0) : row.checked,
          has("image") ? (p.image ?? null) : row.image,
          has("minutes") ? (p.minutes ?? null) : row.minutes,
          has("hours") ? (p.hours ?? null) : row.hours,
          ...(has("booking")
            ? bookingColumns(p.booking ?? null)
            : [row.booking_state, row.booking_by, row.booking_code, row.booking_url]),
          has("due") ? (p.due ?? null) : row.due,
          has("assignee") ? (p.assignee ?? null) : row.assignee,
          has("link") ? (p.link ?? null) : row.link,
          has("x") ? p.x : row.x,
          has("y") ? p.y : row.y,
          has("rot") ? p.rot : row.rot,
          now,
          m.id,
        );
        return { ok: true, value: m };
      }
      case "note:recolor": {
        const row = this.note(m.id);
        if (row === undefined) return { ok: false, reason: "no such note" };
        // a text box and a sticker have no paper to color
        if (row.kind !== "memo" && row.kind !== "suggestion")
          return { ok: false, reason: "not on paper" };
        sql.exec("UPDATE notes SET color = ?, updated_at = ? WHERE id = ?", m.color, now, m.id);
        return { ok: true, value: m };
      }
      case "text:edit": {
        const row = this.note(m.id);
        if (row === undefined) return { ok: false, reason: "no such note" };
        if (row.kind !== "text") return { ok: false, reason: "not a text box" };
        // a text box's words are kept as its title (faceColumns)
        sql.exec("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?", m.text, now, m.id);
        return { ok: true, value: m };
      }
      case "note:adopt": {
        const row = this.note(m.id);
        if (row === undefined) return { ok: false, reason: "no such note" };
        if (row.kind !== "suggestion") return { ok: false, reason: "not a suggestion" };
        sql.exec(
          `UPDATE notes SET kind = 'memo', color = '#ffffff', body = '', tags = '[]', maps_url = NULL,
             pin_lat = NULL, pin_lng = NULL, sched_date = NULL, sched_time = NULL, sched_status = NULL,
             budget = NULL, checked = 0, minutes = NULL, hours = NULL, booking_state = NULL, booking_by = NULL,
             booking_code = NULL, booking_url = NULL, due = NULL, assignee = NULL, link = NULL, updated_at = ?
           WHERE id = ?`,
          now,
          m.id,
        );
        return { ok: true, value: m };
      }
      case "note:move": {
        const row = this.note(m.id);
        if (row === undefined) return { ok: false, reason: "no such note" };
        // a move that does not say how the card is turned or how large keeps what it was
        sql.exec(
          "UPDATE notes SET x = ?, y = ?, rot = ?, scale = ?, updated_at = ? WHERE id = ?",
          m.x,
          m.y,
          m.rot ?? row.rot,
          m.scale ?? row.scale,
          now,
          m.id,
        );
        return { ok: true, value: m };
      }
      case "note:delete": {
        if (this.note(m.id) === undefined) return { ok: false, reason: "no such note" };
        sql.exec("UPDATE notes SET deleted_at = ? WHERE id = ?", now, m.id);
        return { ok: true, value: m };
      }
      case "day:intro": {
        const n = sql.exec("UPDATE days SET intro = ? WHERE date = ?", m.intro, m.date).rowsWritten;
        return n === 0 ? { ok: false, reason: "no such day" } : { ok: true, value: m };
      }
      case "member:profile": {
        sql.exec("UPDATE members SET name = ?, color = ? WHERE id = ?", m.name, m.color, by);
        return { ok: true, value: m };
      }
      case "trip:dates": {
        // the trip moves by how far its first day moved, and its days are the new run of them:
        // each day keeps its place in the trip (day 2's intro is day 2's), each planned note
        // moves with the trip, and one that falls past the new last day loses its day
        const old = sql
          .exec<{ date: IsoDate; intro: string }>("SELECT date, intro FROM days ORDER BY position")
          .toArray();
        const was = old[0]?.date ?? m.first;
        const shift = (Date.parse(`${m.first}T00:00Z`) - Date.parse(`${was}T00:00Z`)) / 86_400_000;
        const dates = Array.from({ length: m.days }, (_, i) =>
          new Date(Date.parse(`${m.first}T00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
        );
        // a trip running past 9999-12-31 has days no date is written for ("+010000-01")
        if (!dates.every((date) => v.is(IsoDateSchema, date)))
          return { ok: false, reason: "no such day" };
        sql.exec("DELETE FROM days");
        dates.forEach((date, i) =>
          sql.exec(
            "INSERT INTO days (date, position, intro) VALUES (?, ?, ?)",
            date,
            i,
            old[i]?.intro ?? "",
          ),
        );
        if (shift !== 0)
          sql.exec(
            `UPDATE notes SET sched_date = date(sched_date, ? || ' days'), updated_at = ?
               WHERE sched_date IS NOT NULL`,
            (shift > 0 ? "+" : "") + String(shift),
            now,
          );
        sql.exec(
          `UPDATE notes SET sched_date = NULL, sched_time = NULL, sched_status = NULL, updated_at = ?
             WHERE sched_date IS NOT NULL AND (sched_date < ? OR sched_date > ?)`,
          now,
          dates[0],
          dates.at(-1),
        );
        return { ok: true, value: m };
      }
      case "trip:flight": {
        if (m.flight === null) sql.exec("DELETE FROM flights WHERE leg = ?", m.leg);
        else
          sql.exec(
            `INSERT INTO flights (leg, number, from_place, to_place, departs, arrives)
               VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (leg) DO UPDATE SET number = excluded.number, from_place = excluded.from_place,
               to_place = excluded.to_place, departs = excluded.departs, arrives = excluded.arrives`,
            m.leg,
            m.flight.number,
            m.flight.from,
            m.flight.to,
            m.flight.departs,
            m.flight.arrives,
          );
        return { ok: true, value: m };
      }
      case "trip:stays": {
        sql.exec("DELETE FROM stays");
        m.stays.forEach((s, i) =>
          sql.exec(
            `INSERT INTO stays (position, name, check_in, nights, maps_url, pin_lat, pin_lng)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            i,
            s.name,
            s.checkIn,
            s.nights,
            s.mapsUrl,
            s.pin?.lat ?? null,
            s.pin?.lng ?? null,
          ),
        );
        return { ok: true, value: m };
      }
      case "trip:rename": {
        sql.exec("UPDATE trip SET name = ? WHERE id = 1", m.name);
        return { ok: true, value: m };
      }
    }
  }

  private withinRate(
    counts: Map<MemberId, { since: number; n: number }>,
    member: MemberId,
  ): boolean {
    const now = Date.now();
    const r = counts.get(member);
    if (r === undefined || now - r.since > RATE.window) {
      counts.set(member, { since: now, n: 1 });
      return true;
    }
    r.n++;
    return r.n <= RATE.max;
  }

  private count(kind?: MemberKind): number {
    const sql = this.ctx.storage.sql;
    const row =
      kind === undefined
        ? sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members").one()
        : sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE kind = ?", kind).one();
    return row.n;
  }

  /**
   * Whether the room does not act for `id`: it acts only for a person in its table, in a room
   * that is not deleted. Its refusal (OUTSIDE) is an answer, not a throw, so the Worker tells it
   * apart from a failure
   */
  private outsider(id: MemberId): boolean {
    return this.person(id) === null || this.deletion() !== null;
  }

  /** The person `id` names in the room's table, as an id read with its schema; null for none */
  private person(id: string): MemberId | null {
    const row = this.ctx.storage.sql
      .exec<{ id: string }>("SELECT id FROM members WHERE id = ? AND kind = 'person'", id)
      .toArray()[0];
    return row === undefined ? null : parseMemberId(row.id);
  }
}

/** Every column of a note, in the order `notesTable` makes them; a misspelt one fails to compile */
const NOTE_COLUMNS = (
  [
    "id",
    "kind",
    "title",
    "color",
    "x",
    "y",
    "rot",
    "by",
    "updated_at",
    "body",
    "tags",
    "maps_url",
    "pin_lat",
    "pin_lng",
    "sched_date",
    "sched_time",
    "sched_status",
    "budget",
    "deleted_at",
    "checked",
    "image",
    "scale",
    "minutes",
    "hours",
    "booking_state",
    "booking_by",
    "booking_code",
    "booking_url",
    "due",
    "assignee",
    "link",
  ] satisfies (keyof NoteRow | "deleted_at")[]
).join(", ");

/**
 * The notes on the desk, to select from as from a table: a deleted note keeps its row (its id is
 * never used again) and is no note anywhere else, so no query reads `notes` for what is on it
 */
const ON_DESK = "(SELECT rowid, * FROM notes WHERE deleted_at IS NULL)";

/** The notes table as it is now, under `name`: memos, suggestions, text boxes and stickers */
const notesTable = (name: string) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('memo', 'suggestion', 'text', 'sticker')),
    title TEXT NOT NULL,
    color TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    rot REAL NOT NULL,
    by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    maps_url TEXT,
    pin_lat REAL,
    pin_lng REAL,
    sched_date TEXT,
    sched_time TEXT,
    sched_status TEXT,
    budget REAL,
    deleted_at TEXT,
    checked INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    scale REAL NOT NULL DEFAULT 1,
    minutes INTEGER,
    hours TEXT,
    booking_state TEXT,
    booking_by TEXT,
    booking_code TEXT,
    booking_url TEXT,
    due TEXT,
    assignee TEXT,
    link TEXT
  )
`;

/** A note's tags as its column keeps them: a JSON array of strings */
const tagsOf = (column: string): Tag[] => {
  const tags: unknown = JSON.parse(column);
  return Array.isArray(tags) ? tags.flatMap((t: unknown) => parseTag(t) ?? []) : [];
};

const fromRow = (r: NoteRow): WireNote => {
  const card = {
    id: r.id,
    x: r.x,
    y: r.y,
    rot: r.rot,
    scale: r.scale,
    by: r.by,
    updatedAt: r.updated_at,
  };
  const memo = (): WireMemo => ({
    ...card,
    title: r.title,
    color: r.color,
    kind: "memo",
    body: r.body,
    tags: tagsOf(r.tags),
    mapsUrl: r.maps_url,
    pin: r.pin_lat === null || r.pin_lng === null ? null : { lat: r.pin_lat, lng: r.pin_lng },
    schedule:
      r.sched_date === null || r.sched_status === null
        ? null
        : { date: r.sched_date, time: r.sched_time, status: r.sched_status },
    budget: r.budget,
    checked: r.checked === 1,
    image: r.image ?? null,
    minutes: r.minutes,
    hours: r.hours,
    booking: bookingOf(r),
    due: r.due,
    assignee: r.assignee,
    link: r.link,
  });
  switch (r.kind) {
    case "memo":
      return memo();
    case "suggestion":
      return { ...card, title: r.title, color: r.color, kind: "suggestion" };
    case "text":
      return { ...card, kind: "text", text: r.title };
    case "sticker":
      // a sticker is never written without its picture; one that had none would be shown as the
      // memo it is kept as rather than not at all
      return r.image === null ? memo() : { ...card, kind: "sticker", image: r.image };
  }
};

/**
 * What a note shows of itself as the title and color columns keep it: paper its title and
 * color; a text box its words, as its title, on white; a sticker no words, on white
 */
const faceColumns = (n: WireNote): [NoteRow["title"], NoteRow["color"]] => {
  switch (n.kind) {
    case "memo":
    case "suggestion":
      return [n.title, n.color];
    case "text":
      return [n.text, "#ffffff"];
    case "sticker":
      return ["", "#ffffff"];
  }
};

/** A booking as its columns keep it: the state, then what that state has */
const bookingColumns = (
  b: WireBooking | null,
): [
  NoteRow["booking_state"],
  NoteRow["booking_by"],
  NoteRow["booking_code"],
  NoteRow["booking_url"],
] =>
  b === null
    ? [null, null, null, null]
    : b.state === "needed"
      ? ["needed", b.by, null, null]
      : ["booked", null, b.code, b.url];

const bookingOf = (r: NoteRow): WireBooking | null => {
  if (r.booking_state === "needed") return { state: "needed", by: r.booking_by };
  if (r.booking_state === "booked")
    return { state: "booked", code: r.booking_code ?? "", url: r.booking_url };
  return null;
};

/** Where a published booklet is in the bucket; its slug is its only name */
export const bookletKey = (slug: string) => `booklets/${slug}/shiori.html`;

/** A booklet's slug: 16 random bytes, base64url, 22 characters, so its link cannot be guessed */
export const newSlug = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Now, as the room stamps what it applies */
const stamp = (): IsoInstant => v.parse(IsoInstantSchema, new Date().toISOString());

/** The trip's flights, one a leg; a time not known yet is null */
const flightsTable = (name: string) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    leg TEXT PRIMARY KEY CHECK (leg IN ('out', 'back')),
    number TEXT NOT NULL,
    from_place TEXT NOT NULL,
    to_place TEXT NOT NULL,
    departs TEXT,
    arrives TEXT
  )
`;
