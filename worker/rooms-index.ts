import { DurableObject } from "cloudflare:workers";

/** Why a paid call was not reserved */
export type Refusal = "day" | "trip";

/**
 * One per account: which rooms each e-mail belongs to, and as which member, and what each
 * person has spent (docs/auth-and-security.md, "The budget"). The only place an e-mail is stored.
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
    `);
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

  /** The member id `email` has in `roomId`, or null when it is not a member */
  resolve(email: string, roomId: string): string | null {
    const row = this.ctx.storage.sql
      .exec<{ member_id: string }>(
        "SELECT member_id FROM memberships WHERE email = ? AND room_id = ?",
        email.toLowerCase(),
        roomId,
      )
      .toArray()[0];
    return row?.member_id ?? null;
  }

  rooms(email: string): string[] {
    return this.ctx.storage.sql
      .exec<{ room_id: string }>(
        "SELECT room_id FROM memberships WHERE email = ? ORDER BY rowid",
        email.toLowerCase(),
      )
      .toArray()
      .map((r) => r.room_id);
  }

  /** Records a membership the room has already minted; false when `email` is at its room cap */
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
}

/** A ceiling from a var; anything but a non-negative integer is 0, so nothing is spent */
const ceiling = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};
