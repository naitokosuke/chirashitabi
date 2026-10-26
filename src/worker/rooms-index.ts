import { DurableObject } from "cloudflare:workers";

import { parseEmail, parserOf, type Email, type Result } from "../contract";
import { parseMemberId, type MemberId } from "../contract/member";
import { parseRoomId, type Ceiling, type RoomId } from "../contract/room";
import { IsoInstantSchema, type IsoInstant } from "../contract/wire";

import { SPACING_MS } from "./geocode";
import { parseSeatId, type SeatId } from "./room";

/** How far ahead the geocoder's turns may be taken: past it, a lookup fails rather than waits */
const GEOCODER_QUEUE_MS = 5000;

/**
 * How many of the turns to come one person's lookups may hold, free or budgeted: of the few
 * that fit in GEOCODER_QUEUE_MS, enough for a lookup and the next, and never all of them
 */
const TURNS_EACH = 2;

/**
 * One per account: which rooms each e-mail belongs to, and as which member, which rooms it is
 * invited to, and what each person has spent (docs/auth-and-security.md, "The budget"). The
 * only place an e-mail is stored, lowercased as `Email` is.
 */
export class RoomsIndex extends DurableObject<Env> {
  static readonly MAX_ROOMS_PER_EMAIL = 10;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS memberships (
        email TEXT NOT NULL,
        room_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        PRIMARY KEY (email, room_id)
      );
      CREATE TABLE IF NOT EXISTS spends (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL,
        room_id TEXT NOT NULL,
        day TEXT NOT NULL,
        refunded INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS invitations (
        email TEXT NOT NULL,
        room_id TEXT NOT NULL,
        invite_id TEXT NOT NULL,
        PRIMARY KEY (email, room_id)
      );
    `);
    // Indexes made before a room could be deleted gain the column once
    const cols = ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(memberships)").toArray();
    if (!cols.some((c) => c.name === "deleted_at")) {
      ctx.storage.sql.exec("ALTER TABLE memberships ADD COLUMN deleted_at TEXT");
    }
    // and the indexes the budget's counts and a room's rows are found by, once they were missed:
    // a person's day and trip (a trip's rows by room first, which dropping a room finds them by),
    // and a room's memberships and invitations
    ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS spends_by_day ON spends (email, day);
      CREATE INDEX IF NOT EXISTS spends_by_room ON spends (room_id, email);
      CREATE INDEX IF NOT EXISTS memberships_by_room ON memberships (room_id);
      CREATE INDEX IF NOT EXISTS invitations_by_room ON invitations (room_id);
    `);
  }

  // ---- the budget: reserve, call, settle ----

  /**
   * Reserves one paid call for `email` in `roomId`, before it is made. The ceilings are vars,
   * so only a deploy changes them; a var that is missing or not a number allows nothing.
   * Returns the reservation's id, to refund it if the provider answers with an error.
   */
  reserve(email: Email, roomId: RoomId): Result<number, Ceiling> {
    const day = new Date().toISOString().slice(0, 10); // UTC
    const sql = this.ctx.storage.sql;
    if (this.#prunedOn !== day) {
      this.prune(day);
      this.#prunedOn = day;
    }
    const spent = (where: string, ...args: string[]) =>
      sql
        .exec<{ n: number }>(
          `SELECT COUNT(*) AS n FROM spends WHERE email = ? AND refunded = 0 AND ${where}`,
          email,
          ...args,
        )
        .one().n;
    if (spent("day = ?", day) >= ceiling(this.env.SPEND_PER_DAY))
      return { ok: false, reason: "day" };
    if (spent("room_id = ?", roomId) >= ceiling(this.env.SPEND_PER_TRIP))
      return { ok: false, reason: "trip" };
    sql.exec("INSERT INTO spends (email, room_id, day) VALUES (?, ?, ?)", email, roomId, day);
    return {
      ok: true,
      value: sql.exec<{ id: number }>("SELECT last_insert_rowid() AS id").one().id,
    };
  }

  /** The provider answered with an error: the reservation was not spent */
  refund(id: number): void {
    this.ctx.storage.sql.exec("UPDATE spends SET refunded = 1 WHERE id = ?", id);
  }

  /** The UTC day the spends were last pruned on, in memory: an index woken again prunes again */
  #prunedOn: string | null = null;

  /**
   * The spends no ceiling counts any more go, before `today`'s first reservation: a day before it
   * counts for no day's ceiling, so its rows are kept only for the trip's, while their room
   * exists and they were spent. A refunded row counts for neither, and a room gone for good
   * (no membership left) has no trip to count for
   */
  private prune(today: string): void {
    this.ctx.storage.sql.exec(
      `DELETE FROM spends WHERE day < ? AND (
         refunded = 1 OR room_id NOT IN (SELECT room_id FROM memberships)
       )`,
      today,
    );
  }

  // ---- OpenStreetMap's geocoder: one request a second for the whole app (geocode.ts) ----

  /**
   * When the next request may go, in ms since the epoch. Kept in memory: there is one index,
   * and one evicted had no request for far longer than a turn
   */
  #geocoderAt = 0;

  /**
   * The turns each person's lookups hold that have not come yet, by e-mail, in memory as the
   * queue is
   */
  #turns = new Map<Email, number[]>();

  /**
   * A turn at the geocoder for a lookup `asker` makes: how many ms to wait before asking, the
   * turns spaced SPACING_MS apart; null when the turns already taken run past GEOCODER_QUEUE_MS,
   * or while `asker` holds TURNS_EACH of the turns to come, and it is not asked. A budgeted
   * lookup is held to the share as a free one is: the budget bounds what Claude is paid, not how
   * many lookups wait at once, so nobody's lookups crowd out everyone else's.
   */
  geocoderTurn(asker: Email): number | null {
    const spacing = paceOf(this.env.GEOCODER_SPACING_MS, SPACING_MS);
    const queue = paceOf(this.env.GEOCODER_QUEUE_MS, GEOCODER_QUEUE_MS);
    const now = Date.now();
    const at = Math.max(now, this.#geocoderAt);
    if (at - now > queue) return null;
    // a turn that has come is held no longer
    for (const [email, turns] of this.#turns) {
      const ahead = turns.filter((t) => t > now);
      if (ahead.length === 0) this.#turns.delete(email);
      else this.#turns.set(email, ahead);
    }
    const held = this.#turns.get(asker) ?? [];
    if (held.length >= TURNS_EACH) return null;
    this.#turns.set(asker, [...held, at]);
    this.#geocoderAt = at + spacing;
    return at - now;
  }

  // ---- memberships ----

  /**
   * The member id `email` has in `roomId`, or null when it is not a member. A deleted room
   * speaks for nobody, but with `deleted`, which is how its owner restores it.
   */
  resolve(email: Email, roomId: RoomId, deleted = false): MemberId | null {
    const row = this.ctx.storage.sql
      .exec<{ member_id: string }>(
        `SELECT member_id FROM memberships
           WHERE email = ? AND room_id = ? AND deleted_at IS ${deleted ? "NOT NULL" : "NULL"}`,
        email,
        roomId,
      )
      .toArray()[0];
    return row === undefined ? null : parseMemberId(row.member_id);
  }

  /**
   * The deleted rooms `email` was in, oldest first: who it was in each, and when the index hid it,
   * which is the room's own deletion time unless the room's part of it did not go through
   */
  deletions(email: Email): { roomId: RoomId; memberId: MemberId; at: IsoInstant }[] {
    return this.ctx.storage.sql
      .exec<{ room_id: string; member_id: string; deleted_at: string }>(
        `SELECT room_id, member_id, deleted_at FROM memberships
           WHERE email = ? AND deleted_at IS NOT NULL ORDER BY rowid`,
        email,
      )
      .toArray()
      .flatMap((r) => {
        const roomId = parseRoomId(r.room_id);
        const memberId = parseMemberId(r.member_id);
        const at = parserOf(IsoInstantSchema)(r.deleted_at);
        return roomId === null || memberId === null || at === null
          ? []
          : [{ roomId, memberId, at }];
      });
  }

  /** The rooms `email` is in and who it is in each, oldest first; deleted ones left out */
  memberships(email: Email): { roomId: RoomId; memberId: MemberId }[] {
    return this.ctx.storage.sql
      .exec<{ room_id: string; member_id: string }>(
        `SELECT room_id, member_id FROM memberships
           WHERE email = ? AND deleted_at IS NULL ORDER BY rowid`,
        email,
      )
      .toArray()
      .flatMap((r) => {
        const roomId = parseRoomId(r.room_id);
        const memberId = parseMemberId(r.member_id);
        return roomId === null || memberId === null ? [] : [{ roomId, memberId }];
      });
  }

  /**
   * Records the creator of a room `create` has just set up; refused when `email` is at its room
   * cap. A deleted room still counts until it is gone for good. Recorded already (a try whose
   * answer was lost), it is answered the same.
   */
  add(email: Email, roomId: RoomId, memberId: MemberId): Result<void, "at the cap"> {
    if (this.recorded(email, roomId, memberId)) return { ok: true, value: undefined };
    if (this.atCap(email)) return { ok: false, reason: "at the cap" };
    this.ctx.storage.sql.exec(
      "INSERT INTO memberships (email, room_id, member_id) VALUES (?, ?, ?)",
      email,
      roomId,
      memberId,
    );
    return { ok: true, value: undefined };
  }

  /**
   * Records someone the room let in on their invitation to the seat `seat`, which is answered
   * with it, in one step: refused when that invitation is gone (withdrawn, declined, or the room
   * deleted, all of which take it out first), so the index never lists someone the room has given
   * the seat back from, and refused at the room cap as `add` is. The row is as deleted as the
   * room's others. Recorded already (a try whose answer was lost), it is answered the same.
   */
  join(
    email: Email,
    roomId: RoomId,
    memberId: MemberId,
    seat: SeatId,
  ): Result<void, "not invited" | "at the cap"> {
    if (this.recorded(email, roomId, memberId)) return { ok: true, value: undefined };
    if (this.invitation(email, roomId) !== seat) return { ok: false, reason: "not invited" };
    if (this.atCap(email)) return { ok: false, reason: "at the cap" };
    const sql = this.ctx.storage.sql;
    sql.exec(
      `INSERT INTO memberships (email, room_id, member_id, deleted_at)
         VALUES (?, ?, ?, (SELECT deleted_at FROM memberships WHERE room_id = ? LIMIT 1))`,
      email,
      roomId,
      memberId,
      roomId,
    );
    sql.exec("DELETE FROM invitations WHERE email = ? AND room_id = ?", email, roomId);
    return { ok: true, value: undefined };
  }

  /** Whether `email` is recorded in `roomId` as `memberId` already */
  private recorded(email: Email, roomId: RoomId, memberId: MemberId): boolean {
    return (
      this.ctx.storage.sql
        .exec(
          "SELECT 1 FROM memberships WHERE email = ? AND room_id = ? AND member_id = ?",
          email,
          roomId,
          memberId,
        )
        .toArray().length > 0
    );
  }

  /** Whether `email` has as many rooms as it may, deleted ones counted */
  private atCap(email: Email): boolean {
    const { n } = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE email = ?", email)
      .one();
    return n >= RoomsIndex.MAX_ROOMS_PER_EMAIL;
  }

  /** `memberId` is no longer in `roomId`: removed by the owner, or left */
  forget(roomId: RoomId, memberId: MemberId): void {
    this.ctx.storage.sql.exec(
      "DELETE FROM memberships WHERE room_id = ? AND member_id = ?",
      roomId,
      memberId,
    );
  }

  // ---- invitations: a seat the room holds for an e-mail, until it is taken or given back ----

  /**
   * Records that `email` is invited to `roomId`, to the room's seat `seat`, before the room holds
   * it; returns the seat recorded, which is the one recorded before when `email` is invited there
   * already (a try that failed part way, asked again). Refused when it is already a member there.
   */
  invite(email: Email, roomId: RoomId, seat: SeatId): Result<SeatId, "already in"> {
    const sql = this.ctx.storage.sql;
    if (
      sql.exec("SELECT 1 FROM memberships WHERE email = ? AND room_id = ?", email, roomId).toArray()
        .length > 0
    )
      return { ok: false, reason: "already in" };
    const before = this.invitation(email, roomId);
    if (before !== null) return { ok: true, value: before };
    sql.exec(
      "INSERT INTO invitations (email, room_id, invite_id) VALUES (?, ?, ?)",
      email,
      roomId,
      seat,
    );
    return { ok: true, value: seat };
  }

  /** The rooms `email` is invited to, oldest first */
  invitations(email: Email): RoomId[] {
    return this.ctx.storage.sql
      .exec<{ room_id: string }>(
        "SELECT room_id FROM invitations WHERE email = ? ORDER BY rowid",
        email,
      )
      .toArray()
      .flatMap((r) => parseRoomId(r.room_id) ?? []);
  }

  /** Who `roomId` has invited and not heard from yet, oldest first */
  invited(roomId: RoomId): Email[] {
    return this.ctx.storage.sql
      .exec<{ email: string }>(
        "SELECT email FROM invitations WHERE room_id = ? ORDER BY rowid",
        roomId,
      )
      .toArray()
      .flatMap((r) => parseEmail(r.email) ?? []);
  }

  /**
   * What the index lists of `roomId`, read in one step for the room to give back what it lost: the
   * seats its invitations hold, and the members it records
   */
  listed(roomId: RoomId): { seats: SeatId[]; members: MemberId[] } {
    const sql = this.ctx.storage.sql;
    return {
      seats: sql
        .exec<{ invite_id: string }>("SELECT invite_id FROM invitations WHERE room_id = ?", roomId)
        .toArray()
        .flatMap((r) => parseSeatId(r.invite_id) ?? []),
      members: sql
        .exec<{ member_id: string }>("SELECT member_id FROM memberships WHERE room_id = ?", roomId)
        .toArray()
        .flatMap((r) => parseMemberId(r.member_id) ?? []),
    };
  }

  /**
   * The room's seat the invitation of `email` to `roomId` holds, left in place until the
   * membership is recorded (`join`) or the invitation is taken (`take`), so an acceptance that
   * failed part way can be asked again; null when there is none
   */
  invitation(email: Email, roomId: RoomId): SeatId | null {
    const row = this.ctx.storage.sql
      .exec<{ invite_id: string }>(
        "SELECT invite_id FROM invitations WHERE email = ? AND room_id = ?",
        email,
        roomId,
      )
      .toArray()[0];
    return row === undefined ? null : parseSeatId(row.invite_id);
  }

  /**
   * Takes the invitation of `email` to `roomId` out, declined, withdrawn or refused; returns the
   * seat it held, for the room to give back, or null when there was none to take: answered
   * (`join`) or taken already. Taken in one step, so of an answer and a withdrawal only one wins.
   */
  take(email: Email, roomId: RoomId): SeatId | null {
    const row = this.ctx.storage.sql
      .exec<{ invite_id: string }>(
        "DELETE FROM invitations WHERE email = ? AND room_id = ? RETURNING invite_id",
        email,
        roomId,
      )
      .toArray()[0];
    return row === undefined ? null : parseSeatId(row.invite_id);
  }

  // ---- deleting a room: hidden from everyone at once, gone for good when the room says so ----

  /** The room was deleted at `at`, or restored (null); its members' lists and requests follow */
  mark(roomId: RoomId, at: IsoInstant | null): void {
    const sql = this.ctx.storage.sql;
    sql.exec("UPDATE memberships SET deleted_at = ? WHERE room_id = ?", at, roomId);
    // nobody is waiting to join a room nobody can open
    if (at !== null) sql.exec("DELETE FROM invitations WHERE room_id = ?", roomId);
  }

  /**
   * The room is gone for good: nothing of it is left here but what was spent in it today, which
   * its people's day ceilings still count (a trip made, spent in and erased would otherwise give
   * the day back); the first reservation of a later day prunes that too
   */
  drop(roomId: RoomId): void {
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM memberships WHERE room_id = ?", roomId);
    sql.exec("DELETE FROM invitations WHERE room_id = ?", roomId);
    sql.exec(
      "DELETE FROM spends WHERE room_id = ? AND (day < ? OR refunded = 1)",
      roomId,
      new Date().toISOString().slice(0, 10), // UTC, as `reserve` counts days
    );
  }
}

/** A ceiling from a var; anything but a non-negative integer is 0, so nothing is spent */
const ceiling = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

/**
 * The geocoder's pace in ms from a var only the tests set, to keep their waits short; unset, or
 * anything but a non-negative integer, it is `fallback`, the pace production keeps
 */
const paceOf = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && Number.isInteger(n) && n >= 0 ? n : fallback;
};
