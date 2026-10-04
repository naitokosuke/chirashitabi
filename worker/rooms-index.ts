import { DurableObject } from "cloudflare:workers";

/** Why a paid call was not reserved */
export type Refusal = "day" | "trip";

/**
 * One per account: which rooms each e-mail belongs to, and as which member, which rooms it is
 * invited to, and what each person has spent (docs/auth-and-security.md, "The budget"). The
 * only place an e-mail is stored.
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
  }

  // ---- the budget: reserve, call, settle ----

  /**
   * Reserves one paid call for `email` in `roomId`, before it is made. The ceilings are vars,
   * so only a deploy changes them; a var that is missing or not a number allows nothing.
   * Returns the reservation's id, to refund it if the provider answers with an error.
   */
  reserve(email: string, roomId: string): { id: number } | { refused: Refusal } {
    const e = email.toLowerCase();
    const day = new Date().toISOString().slice(0, 10); // UTC
    const sql = this.ctx.storage.sql;
    const spent = (where: string, ...args: string[]) =>
      sql
        .exec<{ n: number }>(
          `SELECT COUNT(*) AS n FROM spends WHERE email = ? AND refunded = 0 AND ${where}`,
          e,
          ...args,
        )
        .one().n;
    if (spent("day = ?", day) >= ceiling(this.env.SPEND_PER_DAY)) return { refused: "day" };
    if (spent("room_id = ?", roomId) >= ceiling(this.env.SPEND_PER_TRIP))
      return { refused: "trip" };
    sql.exec("INSERT INTO spends (email, room_id, day) VALUES (?, ?, ?)", e, roomId, day);
    return { id: sql.exec<{ id: number }>("SELECT last_insert_rowid() AS id").one().id };
  }

  /** The provider answered with an error: the reservation was not spent */
  refund(id: number): void {
    this.ctx.storage.sql.exec("UPDATE spends SET refunded = 1 WHERE id = ?", id);
  }

  // ---- memberships ----

  /**
   * The member id `email` has in `roomId`, or null when it is not a member. A deleted room
   * speaks for nobody, but with `deleted`, which is how its owner restores it.
   */
  resolve(email: string, roomId: string, deleted = false): string | null {
    const row = this.ctx.storage.sql
      .exec<{ member_id: string }>(
        `SELECT member_id FROM memberships
           WHERE email = ? AND room_id = ? AND deleted_at IS ${deleted ? "NOT NULL" : "NULL"}`,
        email.toLowerCase(),
        roomId,
      )
      .toArray()[0];
    return row?.member_id ?? null;
  }

  /** The rooms `email` is in, oldest first; with `deleted`, the deleted ones instead */
  rooms(email: string, deleted = false): string[] {
    return this.ctx.storage.sql
      .exec<{ room_id: string }>(
        `SELECT room_id FROM memberships
           WHERE email = ? AND deleted_at IS ${deleted ? "NOT NULL" : "NULL"} ORDER BY rowid`,
        email.toLowerCase(),
      )
      .toArray()
      .map((r) => r.room_id);
  }

  /** The rooms `email` is in and who it is in each, oldest first; deleted ones left out */
  memberships(email: string): { roomId: string; memberId: string }[] {
    return this.ctx.storage.sql
      .exec<{ room_id: string; member_id: string }>(
        `SELECT room_id, member_id FROM memberships
           WHERE email = ? AND deleted_at IS NULL ORDER BY rowid`,
        email.toLowerCase(),
      )
      .toArray()
      .map((r) => ({ roomId: r.room_id, memberId: r.member_id }));
  }

  /**
   * Records a membership the room has already minted; false when `email` is at its room cap.
   * A deleted room still counts until it is gone for good.
   */
  add(email: string, roomId: string, memberId: string): boolean {
    const e = email.toLowerCase();
    const count = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE email = ?", e)
      .one().n;
    if (count >= RoomsIndex.MAX_ROOMS_PER_EMAIL) return false;
    this.ctx.storage.sql.exec(
      "INSERT INTO memberships (email, room_id, member_id) VALUES (?, ?, ?)",
      e,
      roomId,
      memberId,
    );
    return true;
  }

  /** `memberId` is no longer in `roomId`: removed by the owner, or left */
  forget(roomId: string, memberId: string): void {
    this.ctx.storage.sql.exec(
      "DELETE FROM memberships WHERE room_id = ? AND member_id = ?",
      roomId,
      memberId,
    );
  }

  // ---- invitations: a seat the room holds for an e-mail, until it is taken or given back ----

  /**
   * Records that `email` is invited to `roomId`, to the room's seat `inviteId`; false when it
   * is already a member there or already invited.
   */
  invite(email: string, roomId: string, inviteId: string): boolean {
    const e = email.toLowerCase();
    const sql = this.ctx.storage.sql;
    const known = (table: "memberships" | "invitations") =>
      sql.exec(`SELECT 1 FROM ${table} WHERE email = ? AND room_id = ?`, e, roomId).toArray()
        .length > 0;
    if (known("memberships") || known("invitations")) return false;
    sql.exec(
      "INSERT INTO invitations (email, room_id, invite_id) VALUES (?, ?, ?)",
      e,
      roomId,
      inviteId,
    );
    return true;
  }

  /** The rooms `email` is invited to, oldest first */
  invitations(email: string): string[] {
    return this.ctx.storage.sql
      .exec<{ room_id: string }>(
        "SELECT room_id FROM invitations WHERE email = ? ORDER BY rowid",
        email.toLowerCase(),
      )
      .toArray()
      .map((r) => r.room_id);
  }

  /** Who `roomId` has invited and not heard from yet, oldest first */
  invited(roomId: string): string[] {
    return this.ctx.storage.sql
      .exec<{ email: string }>(
        "SELECT email FROM invitations WHERE room_id = ? ORDER BY rowid",
        roomId,
      )
      .toArray()
      .map((r) => r.email);
  }

  /**
   * Takes the invitation of `email` to `roomId` out, accepted, declined or withdrawn; returns
   * the room's seat it held, or null when there was none.
   */
  take(email: string, roomId: string): string | null {
    const row = this.ctx.storage.sql
      .exec<{ invite_id: string }>(
        "DELETE FROM invitations WHERE email = ? AND room_id = ? RETURNING invite_id",
        email.toLowerCase(),
        roomId,
      )
      .toArray()[0];
    return row?.invite_id ?? null;
  }

  // ---- deleting a room: hidden from everyone at once, gone for good when the room says so ----

  /** The room was deleted at `at`, or restored (null); its members' lists and requests follow */
  mark(roomId: string, at: string | null): void {
    const sql = this.ctx.storage.sql;
    sql.exec("UPDATE memberships SET deleted_at = ? WHERE room_id = ?", at, roomId);
    // nobody is waiting to join a room nobody can open
    if (at !== null) sql.exec("DELETE FROM invitations WHERE room_id = ?", roomId);
  }

  /** The room is gone for good: nothing of it is left here but what was spent in it */
  drop(roomId: string): void {
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM memberships WHERE room_id = ?", roomId);
    sql.exec("DELETE FROM invitations WHERE room_id = ?", roomId);
  }
}

/** A ceiling from a var; anything but a non-negative integer is 0, so nothing is spent */
const ceiling = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};
