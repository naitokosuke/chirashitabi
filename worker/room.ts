import { DurableObject } from "cloudflare:workers";

export type MemberKind = "person" | "agent";

/**
 * A room. Holds its member table keyed by member id; the Worker resolves the
 * caller's e-mail to an id in the index before anything reaches here, and the
 * room acts only for ids in its table. People and agents share the table, but
 * only `create` makes an agent: nobody can be invited as one.
 */
export class Room extends DurableObject<Env> {
  static readonly MAX_PEOPLE = 2;
  static readonly AGENT_ID = "agent:claude";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('person', 'agent')),
        creator INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  /** Mints the creator's member id and the room's agent; returns the creator's id */
  create(): string {
    if (this.count() > 0) throw new Error("room already created");
    const creator = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO members (id, kind, creator) VALUES (?, 'person', 1)",
      creator,
    );
    this.ctx.storage.sql.exec("INSERT INTO members (id, kind) VALUES (?, 'agent')", Room.AGENT_ID);
    return creator;
  }

  /** Called with the inviter's resolved id; mints the invitee's id */
  invite(by: string): string {
    this.assertMember(by);
    if (this.count("person") >= Room.MAX_PEOPLE) throw new Error("room is full");
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec("INSERT INTO members (id, kind) VALUES (?, 'person')", id);
    return id;
  }

  /** The WebSocket for a member; the Worker has already resolved `memberId` */
  async openSocket(memberId: string): Promise<Response> {
    this.assertMember(memberId);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [memberId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Mutations arrive here next; for now each socket hears its own echo.
    ws.send(typeof message === "string" ? message : new Uint8Array(message));
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): void {
    ws.close(code, reason);
    void wasClean;
  }

  private count(kind?: MemberKind): number {
    const sql = this.ctx.storage.sql;
    const row =
      kind === undefined
        ? sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members").one()
        : sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE kind = ?", kind).one();
    return row.n;
  }

  private assertMember(id: string): void {
    const row = this.ctx.storage.sql
      .exec<{ kind: MemberKind }>("SELECT kind FROM members WHERE id = ?", id)
      .toArray()[0];
    if (row === undefined || row.kind !== "person") throw new Error("not a member");
  }
}
