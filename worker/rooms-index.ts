import { DurableObject } from "cloudflare:workers";

/**
 * One per account: which rooms each e-mail belongs to, and as which member.
 * The only place an e-mail is stored. The spend budget will live here too.
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
      )
    `);
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
