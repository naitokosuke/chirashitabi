import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";

import { airportCodeOf, isAirportCode } from "./airports";
import { renderBooklet } from "./booklet";
import type { DraftContext, PlaceContext, SuggestContext, TagContext } from "./claude";
import {
  type HexColor,
  type HttpUrl,
  type MemberId,
  MemberIdSchema,
  type ImageId,
  ImageIdSchema,
  type NoteId,
  NoteIdSchema,
  type Result,
  type RoomId,
  type CurrencyCode,
} from "./types";
import {
  IsoInstantSchema,
  SEATS,
  tagOf,
  type Tag,
  type Cid,
  type IsoDate,
  type IsoDateTime,
  type IsoInstant,
  type IsoTime,
  type ImageType,
  type Lang,
  type NoteColor,
  type NoteStatus,
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
} from "./wire";

export type MemberKind = WireMember["kind"];

/** Done, or why not: what the room or the index declined, for the Worker to answer and log */
export type Done<Reason> = { ok: true } | { ok: false; reason: Reason };
/** Why no seat was held for an invitation */
export type SeatRefusal = "not the owner" | "no seat";
/** Why a person was not taken out: the owner never is, only the owner takes another, or gone already */
export type RemoveRefusal = "the owner" | "not theirs" | "not in";

/** A mutation the room wrote, as it wrote it, or why it did not */
type Applied = Result<WireMutation, RejectReason>;

/** A seat the room holds for an invitation, as it minted it; the index keeps whom it is for */
const SeatIdSchema = v.pipe(v.string(), v.uuid(), v.brand("SeatId"));
export type SeatId = v.InferOutput<typeof SeatIdSchema>;

type Profile = v.InferOutput<typeof ProfileSchema>;

/** A message to a member's socket, as it goes; the type checks it against what the app reads */
const encode = (message: ServerMessage): string => JSON.stringify(message);

/** Messages a member may send in a window; dragging a card sends one every 80ms */
const RATE = { window: 10_000, max: 200 };

type NoteRow = {
  id: NoteId;
  kind: WireNote["kind"];
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
        created_at TEXT NOT NULL
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
    `);
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
   * its id, or null when the room already holds as many as it may.
   */
  async addImage(
    by: MemberId,
    roomId: RoomId,
    type: ImageType,
    bytes: number,
  ): Promise<ImageId | null> {
    this.assertMember(by);
    const sql = this.ctx.storage.sql;
    // off the list before the bytes go, so no card can take a picture whose bytes are going
    const unused = sql
      .exec<{ id: ImageId }>(
        `DELETE FROM pictures
         WHERE created_at < ? AND id NOT IN (SELECT image FROM notes WHERE image IS NOT NULL)
         RETURNING id`,
        new Date(Date.now() - Room.UNUSED_AFTER).toISOString(),
      )
      .toArray()
      .map((p) => `rooms/${roomId}/images/${p.id}`);
    // R2 deletes up to 1000 keys a call; a room holds at most MAX_IMAGES
    if (unused.length > 0) await this.env.IMAGES.delete(unused);
    if (sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM pictures").one().n >= Room.MAX_IMAGES)
      return null;
    const id = v.parse(ImageIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO pictures (id, by, type, bytes, created_at) VALUES (?, ?, ?, ?, ?)",
      id,
      by,
      type,
      bytes,
      new Date().toISOString(),
    );
    return id;
  }

  /** Its bytes could not be written: the room does not have it after all */
  dropImage(id: ImageId): void {
    this.ctx.storage.sql.exec("DELETE FROM pictures WHERE id = ?", id);
  }

  /** Whether the room has a picture by that id, asked for member `by` */
  hasImageFor(by: MemberId, id: ImageId): boolean {
    this.assertMember(by);
    return this.hasImage(id);
  }

  private hasImage(id: ImageId): boolean {
    return (
      this.ctx.storage.sql.exec("SELECT 1 FROM pictures WHERE id = ?", id).toArray().length > 0
    );
  }

  // ---- the public booklet (RPC from the Worker; its file is in R2, the room keeps its slug) ----

  /** The booklet the room has published, asked by member `by`: its slug and when; null for none */
  publication(by: MemberId): { slug: string; at: string } | null {
    this.assertMember(by);
    return this.published();
  }

  /**
   * The owner `by` publishes the booklet as it is now, in `lang`, under a fresh slug, and the
   * one before goes: publishing again is how a link that went too far is taken back. The page
   * is written here from the room's own data (booklet.ts), so nothing a browser sends is on it.
   */
  async publish(
    by: MemberId,
    lang: Lang,
  ): Promise<Result<{ slug: string; at: string }, "not the owner">> {
    this.assertMember(by);
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    // the old file goes first: should anything after fail, the old link answers nothing, and the
    // record still names a slug whose file a retry deletes again (an R2 delete of none is fine)
    const before = this.published();
    if (before !== null) await this.env.IMAGES.delete(bookletKey(before.slug));
    const slug = newSlug();
    const at = new Date().toISOString();
    await this.env.IMAGES.put(
      bookletKey(slug),
      renderBooklet(this.trip(), this.notes(), lang, at),
      {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
      },
    );
    // deleted while the file was on its way: it goes again, and nothing is put up
    if (this.deletion() !== null) {
      await this.env.IMAGES.delete(bookletKey(slug));
      throw new Error("room deleted");
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO publication (id, slug, by, at) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, by = excluded.by, at = excluded.at`,
      slug,
      by,
      at,
    );
    return { ok: true, value: { slug, at } };
  }

  /** The owner `by` takes the booklet down: its link answers nothing from now on */
  async withdraw(by: MemberId): Promise<Done<"not the owner">> {
    this.assertMember(by);
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    await this.unpublish();
    return { ok: true };
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

  private published(): { slug: string; at: string } | null {
    return (
      this.ctx.storage.sql
        .exec<{ slug: string; at: string }>("SELECT slug, at FROM publication")
        .toArray()[0] ?? null
    );
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

  /** Who made the room and so may invite, remove and delete; asked by member `by` */
  owner(by: MemberId): MemberId {
    this.assertMember(by);
    return this.ownerId();
  }

  /**
   * Holds a seat for someone the owner `by` invites, until they answer or the owner takes it
   * back; refused when `by` is not the owner or every seat is taken or held. The index keeps who
   * the seat is for; the room keeps no e-mail.
   */
  openSeat(by: MemberId): Result<SeatId, SeatRefusal> {
    this.assertMember(by);
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    const sql = this.ctx.storage.sql;
    const held = sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM invitations").one().n;
    if (this.count("person") + held >= Room.MAX_PEOPLE) return { ok: false, reason: "no seat" };
    const id = v.parse(SeatIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO invitations (id, created_at) VALUES (?, ?)",
      id,
      new Date().toISOString(),
    );
    return { ok: true, value: id };
  }

  /** The seat is given back: declined, withdrawn, or not recorded in the index after all */
  closeSeat(id: SeatId): void {
    this.ctx.storage.sql.exec("DELETE FROM invitations WHERE id = ?", id);
  }

  /**
   * The invited person takes their seat as who they say they are; returns their new member id,
   * or why not: the seat is gone (withdrawn), or the room deleted. Everyone in is told.
   */
  accept(seat: SeatId, me: Profile): Result<MemberId, "no seat" | "deleted"> {
    if (this.deletion() !== null) return { ok: false, reason: "deleted" };
    const sql = this.ctx.storage.sql;
    if (sql.exec("DELETE FROM invitations WHERE id = ? RETURNING id", seat).toArray().length === 0)
      return { ok: false, reason: "no seat" };
    const id = v.parse(MemberIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO members (id, kind, name, color) VALUES (?, 'person', ?, ?)",
      id,
      me.name,
      me.color,
    );
    this.tellMembers();
    return { ok: true, value: id };
  }

  /** The index could not record a member `accept` just let in: they are not in after all */
  unaccept(member: MemberId): void {
    this.ctx.storage.sql.exec("DELETE FROM members WHERE id = ? AND creator = 0", member);
    this.tellMembers();
  }

  /**
   * A deleted room as a person in it sees it, to restore it; null for anyone else, or when it
   * is not deleted. Only the owner deletes, but either person can take it back, so one member
   * cannot destroy the room beyond recovery (docs/auth-and-security.md).
   */
  deletedFor(by: MemberId): { name: string; deletedAt: string } | null {
    const deletion = this.deletion();
    if (deletion === null || !this.isPerson(by)) return null;
    const { name } = this.ctx.storage.sql
      .exec<{ name: string }>("SELECT name FROM trip WHERE id = 1")
      .one();
    return { name, deletedAt: deletion.at };
  }

  /**
   * Takes `member` out: the owner `by` removing someone else, or someone other than the owner
   * leaving (`by` is `member`). Refused for anything else; the owner never leaves their own
   * room, they delete it. Their notes stay; their socket is told and closed.
   */
  remove(by: MemberId, member: MemberId): Done<RemoveRefusal> {
    this.assertMember(by);
    const owner = this.ownerId();
    if (member === owner) return { ok: false, reason: "the owner" };
    if (by !== owner && by !== member) return { ok: false, reason: "not theirs" };
    const sql = this.ctx.storage.sql;
    const gone = sql
      .exec("DELETE FROM members WHERE id = ? AND kind = 'person' RETURNING id", member)
      .toArray();
    if (gone.length === 0) return { ok: false, reason: "not in" };
    this.#rate.delete(member);
    this.closeSockets(this.ctx.getWebSockets(member), by === member ? "left" : "removed");
    this.tellMembers();
    return { ok: true };
  }

  /**
   * The owner `by` deletes the room: nobody can open it from now on, and in DELETE_AFTER it is
   * gone for good unless the owner restores it. `roomId` is kept for that day, when its pictures
   * go too. Refused when `by` is not the owner.
   */
  async delete(by: MemberId, roomId: RoomId): Promise<Done<"not the owner">> {
    this.assertMember(by);
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    // a deleted trip's booklet is not left up for its thirty days; restoring does not bring it back
    await this.unpublish();
    const at = new Date();
    const sql = this.ctx.storage.sql;
    sql.exec("INSERT INTO deletion (id, room_id, at) VALUES (1, ?, ?)", roomId, at.toISOString());
    sql.exec("DELETE FROM invitations");
    this.closeSockets(this.ctx.getWebSockets(), "deleted");
    void this.ctx.storage.setAlarm(at.getTime() + Room.DELETE_AFTER);
    return { ok: true };
  }

  /** How long a deleted room can be restored */
  static readonly DELETE_AFTER = 30 * 24 * 60 * 60 * 1000;

  /** When the room was deleted, or null while it is not */
  deletedAt(): string | null {
    return this.deletion()?.at ?? null;
  }

  /** A person in the room, `by`, takes the deletion back; refused when it is not deleted */
  restore(by: MemberId): Done<"not deleted"> {
    if (this.deletion() === null) return { ok: false, reason: "not deleted" };
    this.assertPerson(by);
    this.ctx.storage.sql.exec("DELETE FROM deletion");
    void this.ctx.storage.deleteAlarm();
    return { ok: true };
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
  async purge(by: MemberId): Promise<Done<"not deleted" | "not the owner">> {
    const deletion = this.deletion();
    if (deletion === null) return { ok: false, reason: "not deleted" };
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    await this.erase(deletion);
    return { ok: true };
  }

  /** The room goes for good: its pictures, its place in the index, its storage */
  private async erase(deletion: { room_id: RoomId; at: string }): Promise<void> {
    const keys = this.ctx.storage.sql
      .exec<{ id: ImageId }>("SELECT id FROM pictures")
      .toArray()
      .map((p) => `rooms/${deletion.room_id}/images/${p.id}`);
    // R2 deletes up to 1000 keys a call; a room holds at most MAX_IMAGES
    if (keys.length > 0) await this.env.IMAGES.delete(keys);
    await this.unpublish();
    await this.env.ROOMS.getByName("index").drop(deletion.room_id);
    await this.ctx.storage.deleteAll();
  }

  private deletion(): { room_id: RoomId; at: string } | null {
    return (
      this.ctx.storage.sql
        .exec<{ room_id: RoomId; at: string }>("SELECT room_id, at FROM deletion")
        .toArray()[0] ?? null
    );
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
      ws.send(out);
      ws.close(4001, reason);
    }
  }

  /** The trip at a glance, for a member's list of rooms: its name, days, members and memo count */
  summary(by: MemberId | null = null): WireRoomSummary {
    const sql = this.ctx.storage.sql;
    const { name } = sql.exec<{ name: string }>("SELECT name FROM trip WHERE id = 1").one();
    const days = sql
      .exec<{ date: IsoDate }>("SELECT date FROM days ORDER BY position")
      .toArray()
      .map((d) => d.date);
    // the people first, the creator leading; the agent after them
    const members = this.members()
      .sort((a, b) => Number(a.kind === "agent") - Number(b.kind === "agent"))
      .map(({ kind, name, color }) => ({ kind, name, color }));
    const { memos } = sql
      .exec<{ memos: number }>("SELECT COUNT(*) AS memos FROM notes WHERE kind = 'memo'")
      .one();
    const owner = by !== null && by === this.ownerId();
    const [first] = days;
    const glance = { name, members, memos, owner };
    return first === undefined
      ? { ...glance, first: null, days: 0 }
      : { ...glance, first, days: days.length };
  }

  // ---- the agent (RPC from the Worker, inside a member's request) ----

  /** What the agent needs to draft `date`, asked by member `by`; null when the trip has no such day */
  dayForDraft(by: MemberId, date: IsoDate): DraftContext | null {
    this.assertMember(by);
    const trip = this.trip();
    if (!trip.days.some((d) => d.date === date)) return null;
    const notes = this.notes().filter(
      (n): n is WireMemo => n.kind === "memo" && n.schedule?.date === date,
    );
    return { trip: trip.name, currency: trip.currency, date, notes };
  }

  // ---- places: where a memo is ----

  /** What naming a memo's place needs, asked by member `by`: which trip, and when */
  placeContext(by: MemberId): PlaceContext {
    this.assertMember(by);
    const trip = this.trip();
    return { trip: trip.name, days: trip.days.map((d) => d.date) };
  }

  // ---- tags: the ones in use, and the agent's candidates for the trip ----

  /** What tagging a memo needs, asked by member `by`: the trip, the tags in use, the candidates */
  tagContext(by: MemberId): TagContext & { candidates: string[] } {
    this.assertMember(by);
    const trip = this.trip();
    const notes = this.notes();
    const tags = [...new Set(notes.flatMap((n) => (n.kind === "memo" ? n.tags : [])))];
    return {
      trip: trip.name,
      days: trip.days.map((d) => d.date),
      tags,
      titles: notes.map((n) => n.title),
      candidates: this.candidates(),
    };
  }

  /** The agent's candidate tags, kept so they are proposed once a trip, not on every ask */
  saveCandidates(by: MemberId, tags: string[]): void {
    this.assertMember(by);
    const sql = this.ctx.storage.sql;
    this.candidateTable();
    for (const tag of tags) sql.exec("INSERT OR IGNORE INTO tag_candidates (tag) VALUES (?)", tag);
  }

  private candidates(): string[] {
    this.candidateTable();
    return this.ctx.storage.sql
      .exec<{ tag: string }>("SELECT tag FROM tag_candidates ORDER BY rowid")
      .toArray()
      .map((r) => r.tag);
  }

  private candidateTable(): void {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS tag_candidates (tag TEXT PRIMARY KEY)");
  }

  /**
   * What the agent reads to suggest ideas, asked by member `by` from the note `about` (or from
   * none); null when that note is not on the desk, or has no words to start from
   */
  contextForSuggest(by: MemberId, about: NoteId | null): SuggestContext | null {
    this.assertMember(by);
    const trip = this.trip();
    // a sticker has no words to read
    const notes = this.notes().filter((n) => n.kind !== "sticker");
    const from = about === null ? null : notes.find((n) => n.id === about);
    if (from === undefined) return null;
    return {
      trip: trip.name,
      days: trip.days.map((d) => d.date),
      notes: notes.map((n) => ({
        title: n.title,
        tags: n.kind === "memo" ? n.tags : [],
        date: n.kind === "memo" ? (n.schedule?.date ?? null) : null,
      })),
      about:
        from === null
          ? null
          : {
              title: from.title,
              body: from.kind === "memo" ? from.body : "",
              tags: from.kind === "memo" ? from.tags : [],
              pin: from.kind === "memo" ? from.pin : null,
            },
    };
  }

  /**
   * The agent's ideas as suggestion cards, written as the agent (never as the member who
   * asked) around `at` on the desk, and sent to every socket, the asker's too: nobody made
   * them on their own device. Returns how many were written.
   */
  addSuggestions(by: MemberId, titles: string[], at: { x: number; y: number }): number {
    this.assertMember(by);
    const now = stamp();
    let added = 0;
    titles.forEach((title, i) => {
      const note: WireNote = {
        id: v.parse(NoteIdSchema, crypto.randomUUID()),
        kind: "suggestion",
        title,
        color: "#ffffff",
        // a short column under where the asker was looking, slightly askew like any card
        x: at.x - 82 + (i % 2 === 0 ? -12 : 12),
        y: at.y - 40 + i * 120,
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
      for (const ws of this.ctx.getWebSockets()) ws.send(out);
    });
    return added;
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
    const memberId = request.headers.get(Room.MEMBER_HEADER);
    if (request.headers.get("Upgrade") !== "websocket" || memberId === null) {
      return new Response("Bad Request", { status: 400 });
    }
    // removed or deleted between the index's answer and here
    if (!this.isPerson(memberId) || this.deletion() !== null)
      return new Response("Forbidden", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [memberId]);
    server.send(encode(this.snapshot(memberId)));
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const by = this.ctx.getTags(ws)[0];
    if (by === undefined || !this.isPerson(by)) return ws.close(1008, "no member");
    // the client's id for this mutation, once it is known: an answer names it
    let cid: Cid | null = null;
    // what could not be read names no cid; what was read and refused names it when it had one
    const unread = (reason: UnreadReason) => ws.send(encode({ type: "rejected", reason }));
    const reject = (reason: RejectReason) =>
      ws.send(
        encode({
          type: "rejected",
          reason,
          ...(cid === null ? {} : { cid }),
        }),
      );

    if (typeof message !== "string") return unread("text only");
    if (message.length > MAX_MESSAGE_BYTES) return unread("too large");

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return unread("not JSON");
    }
    cid = parseCid(parsed);
    if (!this.withinRate(by)) return reject("too many messages");
    const updatedAt = stamp();
    const mutation = parseMutation(parsed, { by, updatedAt }, isAirportCode);
    if (mutation === null) return reject("not a mutation");

    // a card on its way under a finger is relayed, not kept; letting go sends the move with a cid
    const dragging = cid === null && mutation.type === "note:move";
    if (dragging && this.note(mutation.id) === undefined) return reject("no such note");
    const result: Applied = dragging
      ? { ok: true, value: mutation }
      : this.apply(mutation, by, updatedAt);
    if (!result.ok) return reject(result.reason);

    if (cid !== null) ws.send(encode({ type: "ack", cid, updatedAt }));

    const out = encode({
      type: "mutation",
      mutation: result.value,
      by,
      updatedAt,
    });
    for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(out);
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
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
      const { from_place: from, to_place: to } = f;
      // only a flight between airports on the list (one kept from before stays out until set again)
      if (!isAirportCode(from) || !isAirportCode(to)) continue;
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
      .exec<NoteRow>("SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY rowid")
      .toArray()
      .map(fromRow);
  }

  private note(id: NoteId): NoteRow | undefined {
    return this.ctx.storage.sql
      .exec<NoteRow>("SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL", id)
      .toArray()[0];
  }

  /** Writes the mutation as `by` at `now`; returns what was written, or why it was not */
  private apply(m: WireMutation, by: MemberId, now: IsoInstant): Applied {
    const sql = this.ctx.storage.sql;
    switch (m.type) {
      case "note:add": {
        if (this.note(m.note.id) !== undefined) return { ok: false, reason: "duplicate id" };
        const note = { ...m.note, by, updatedAt: now };
        const memo: WireMemo =
          note.kind === "memo"
            ? note
            : {
                ...note,
                kind: "memo",
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
          note.title,
          note.color,
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
        if (this.note(m.id) === undefined) return { ok: false, reason: "no such note" };
        sql.exec("UPDATE notes SET color = ?, updated_at = ? WHERE id = ?", m.color, now, m.id);
        return { ok: true, value: m };
      }
      case "text:edit": {
        const row = this.note(m.id);
        if (row === undefined) return { ok: false, reason: "no such note" };
        if (row.kind !== "text") return { ok: false, reason: "not a text box" };
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

  private withinRate(member: MemberId): boolean {
    const now = Date.now();
    const r = this.#rate.get(member);
    if (r === undefined || now - r.since > RATE.window) {
      this.#rate.set(member, { since: now, n: 1 });
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

  /** A person in the room's table, the room deleted or not */
  private assertPerson(id: MemberId): void {
    if (!this.isPerson(id)) throw new Error("not a member");
  }

  /** A person in a room that is not deleted: the only one the room acts for */
  private assertMember(id: MemberId): void {
    this.assertPerson(id);
    if (this.deletion() !== null) throw new Error("room deleted");
  }

  private isPerson(id: string): id is MemberId {
    const row = this.ctx.storage.sql
      .exec<{ kind: MemberKind }>("SELECT kind FROM members WHERE id = ?", id)
      .toArray()[0];
    return row?.kind === "person";
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
  return Array.isArray(tags) ? tags.flatMap((t: unknown) => tagOf(t) ?? []) : [];
};

const fromRow = (r: NoteRow): WireNote => {
  const card = {
    id: r.id,
    title: r.title,
    color: r.color,
    x: r.x,
    y: r.y,
    rot: r.rot,
    scale: r.scale,
    by: r.by,
    updatedAt: r.updated_at,
  };
  if (r.kind === "suggestion") return { ...card, kind: "suggestion" };
  if (r.kind === "text") return { ...card, kind: "text" };
  // a sticker is never written without its picture
  if (r.kind === "sticker" && r.image !== null) return { ...card, kind: "sticker", image: r.image };
  return {
    ...card,
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
  };
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
