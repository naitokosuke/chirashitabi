import { DurableObject } from "cloudflare:workers";

import type { NoteStatus } from "../src/app/features/notes/types";

import type { SuggestContext } from "./claude";
import {
  MAX_MESSAGE_BYTES,
  parseCid,
  parseMutation,
  type ServerMessage,
  type WireMember,
  type WireMemo,
  type WireMutation,
  type WireNote,
  type WireTrip,
} from "./wire";

export type MemberKind = "person" | "agent";

interface Profile {
  name: string;
  color: string;
}

/** Messages a member may send in a window; dragging a card sends one every 80ms */
const RATE = { window: 10_000, max: 200 };

type NoteRow = {
  id: string;
  kind: "memo" | "suggestion";
  title: string;
  color: string;
  x: number;
  y: number;
  rot: number;
  by: string;
  updated_at: string;
  body: string;
  tags: string;
  maps_url: string | null;
  pin_lat: number | null;
  pin_lng: number | null;
  sched_date: string | null;
  sched_time: string | null;
  sched_status: string | null;
  budget: number | null;
  checked: number;
  image: string | null;
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
  static readonly MAX_PEOPLE = 2;
  static readonly AGENT_ID = "agent:claude";
  static readonly MEMBER_HEADER = "X-Chirashitabi-Member";

  #rate = new Map<string, { since: number; n: number }>();

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
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('memo', 'suggestion')),
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
        deleted_at TEXT
      );
    `);
    // Rooms made before the appendix's checks were shared gain the column once
    const cols = ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(notes)").toArray();
    if (!cols.some((c) => c.name === "checked")) {
      ctx.storage.sql.exec("ALTER TABLE notes ADD COLUMN checked INTEGER NOT NULL DEFAULT 0");
    }
    // and the pictures on cards, once they arrived
    if (!cols.some((c) => c.name === "image")) {
      ctx.storage.sql.exec("ALTER TABLE notes ADD COLUMN image TEXT");
    }
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS pictures (
        id TEXT PRIMARY KEY,
        by TEXT NOT NULL,
        type TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  // ---- pictures (RPC from the Worker; the bytes are in R2, the room keeps which it has) ----

  /** Pictures a room keeps at most; each is at most MAX_IMAGE_BYTES */
  static readonly MAX_IMAGES = 100;

  /**
   * Takes a picture member `by` is uploading into the room's list, before its bytes are
   * written; the Worker has checked its type and size. Returns its id, or null when the room
   * already holds as many as it may.
   */
  addImage(by: string, type: string, bytes: number): string | null {
    this.assertMember(by);
    const sql = this.ctx.storage.sql;
    if (sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM pictures").one().n >= Room.MAX_IMAGES)
      return null;
    const id = crypto.randomUUID();
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
  dropImage(id: string): void {
    this.ctx.storage.sql.exec("DELETE FROM pictures WHERE id = ?", id);
  }

  /** Whether the room has a picture by that id, asked for member `by` */
  hasImageFor(by: string, id: string): boolean {
    this.assertMember(by);
    return this.hasImage(id);
  }

  private hasImage(id: string): boolean {
    return (
      this.ctx.storage.sql.exec("SELECT 1 FROM pictures WHERE id = ?", id).toArray().length > 0
    );
  }

  // ---- membership (RPC from the Worker) ----

  /** Sets the trip up, mints the creator and the room's agent; returns the creator's id */
  create(trip: WireTrip, me: Profile): string {
    if (this.count() > 0) throw new Error("room already created");
    const sql = this.ctx.storage.sql;
    const creator = crypto.randomUUID();
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

  /** Called with the inviter's resolved id; mints the invitee's id, or null when the room is full */
  invite(by: string, invitee: Profile): string | null {
    this.assertMember(by);
    if (this.count("person") >= Room.MAX_PEOPLE) return null;
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO members (id, kind, name, color) VALUES (?, 'person', ?, ?)",
      id,
      invitee.name,
      invitee.color,
    );
    return id;
  }

  /** The trip's name, for a member's list of rooms */
  title(): string {
    return this.ctx.storage.sql.exec<{ name: string }>("SELECT name FROM trip WHERE id = 1").one()
      .name;
  }

  // ---- the agent (RPC from the Worker, inside a member's request) ----

  /** What the agent needs to draft `date`, asked by member `by`; null when the trip has no such day */
  dayForDraft(
    by: string,
    date: string,
  ): { trip: string; currency: string; notes: WireMemo[] } | null {
    this.assertMember(by);
    const trip = this.trip();
    if (!trip.days.some((d) => d.date === date)) return null;
    const notes = this.notes().filter(
      (n): n is WireMemo => n.kind === "memo" && n.schedule?.date === date,
    );
    return { trip: trip.name, currency: trip.currency, notes };
  }

  /** What the agent reads to suggest ideas, asked by member `by` */
  contextForSuggest(by: string): SuggestContext {
    this.assertMember(by);
    const trip = this.trip();
    return {
      trip: trip.name,
      days: trip.days.map((d) => d.date),
      notes: this.notes().map((n) => ({
        title: n.title,
        tags: n.kind === "memo" ? n.tags : [],
        date: n.kind === "memo" ? (n.schedule?.date ?? null) : null,
      })),
    };
  }

  /**
   * The agent's ideas as suggestion cards, written as the agent (never as the member who
   * asked) around `at` on the desk, and sent to every socket, the asker's too: nobody made
   * them on their own device. Returns how many were written.
   */
  addSuggestions(by: string, titles: string[], at: { x: number; y: number }): number {
    this.assertMember(by);
    const now = new Date().toISOString();
    let added = 0;
    titles.forEach((title, i) => {
      const note: WireNote = {
        id: crypto.randomUUID(),
        kind: "suggestion",
        title,
        color: "#ffffff",
        // a short column under where the asker was looking, slightly askew like any card
        x: at.x - 82 + (i % 2 === 0 ? -12 : 12),
        y: at.y - 40 + i * 120,
        rot: Math.random() * 4 - 2,
        by: Room.AGENT_ID,
        updatedAt: now,
      };
      const result = this.apply({ type: "note:add", note }, Room.AGENT_ID, now);
      if (typeof result === "string") return;
      added++;
      const out = JSON.stringify({
        type: "mutation",
        mutation: result,
        by: Room.AGENT_ID,
        updatedAt: now,
      } satisfies ServerMessage);
      for (const ws of this.ctx.getWebSockets()) ws.send(out);
    });
    return added;
  }

  /**
   * The ledger of the agent's paid calls: who asked, when, for what and how many tokens, for
   * tracing a surprising bill. Member ids only, never an e-mail.
   */
  recordAgentCall(by: string, what: string, tokens: { input: number; output: number }): void {
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
    this.assertMember(memberId);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [memberId]);
    server.send(JSON.stringify(this.snapshot(memberId)));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const by = this.ctx.getTags(ws)[0];
    if (by === undefined) return ws.close(1008, "no member");
    // the client's id for this mutation, once it is known: an answer names it
    let cid: string | null = null;
    const reject = (reason: string) =>
      ws.send(
        JSON.stringify({
          type: "rejected",
          reason,
          ...(cid === null ? {} : { cid }),
        } satisfies ServerMessage),
      );

    if (typeof message !== "string") return reject("text only");
    if (message.length > MAX_MESSAGE_BYTES) return reject("too large");

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return reject("not JSON");
    }
    cid = parseCid(parsed);
    if (!this.withinRate(by)) return reject("too many messages");
    const mutation = parseMutation(parsed);
    if (mutation === null) return reject("not a mutation");

    const updatedAt = new Date().toISOString();
    const result = this.apply(mutation, by, updatedAt);
    if (typeof result === "string") return reject(result);

    if (cid !== null)
      ws.send(JSON.stringify({ type: "ack", cid, updatedAt } satisfies ServerMessage));

    const out = JSON.stringify({
      type: "mutation",
      mutation: result,
      by,
      updatedAt,
    } satisfies ServerMessage);
    for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(out);
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }

  // ---- state ----

  snapshot(me: string): ServerMessage {
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
      .exec<{ id: string; kind: MemberKind; name: string; color: string }>(
        "SELECT id, kind, name, color FROM members ORDER BY creator DESC, rowid",
      )
      .toArray();
  }

  private trip(): WireTrip {
    const sql = this.ctx.storage.sql;
    const t = sql
      .exec<{ name: string; currency: string; center_lat: number; center_lng: number }>(
        "SELECT name, currency, center_lat, center_lng FROM trip WHERE id = 1",
      )
      .one();
    const days = sql
      .exec<{ date: string; intro: string }>("SELECT date, intro FROM days ORDER BY position")
      .toArray();
    return {
      name: t.name,
      currency: t.currency,
      center: { lat: t.center_lat, lng: t.center_lng },
      days,
    };
  }

  private notes(): WireNote[] {
    return this.ctx.storage.sql
      .exec<NoteRow>("SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY rowid")
      .toArray()
      .map(fromRow);
  }

  private note(id: string): NoteRow | undefined {
    return this.ctx.storage.sql
      .exec<NoteRow>("SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL", id)
      .toArray()[0];
  }

  /** Writes the mutation as `by` at `now`; returns what was written, or why it was not */
  private apply(m: WireMutation, by: string, now: string): WireMutation | string {
    const sql = this.ctx.storage.sql;
    switch (m.type) {
      case "note:add": {
        if (this.note(m.note.id) !== undefined) return "duplicate id";
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
                image: null,
              };
        // a card shows only a picture the room has
        if (memo.image !== null && !this.hasImage(memo.image)) return "no such image";
        sql.exec(
          `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at, body, tags, maps_url,
             pin_lat, pin_lng, sched_date, sched_time, sched_status, budget, checked, image)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        );
        return { type: "note:add", note };
      }
      case "note:update": {
        const row = this.note(m.id);
        if (row === undefined) return "no such note";
        if (row.kind !== "memo") return "not a memo";
        const p = m.patch;
        const has = <K extends keyof typeof p>(k: K) => Object.hasOwn(p, k);
        if (has("image") && typeof p.image === "string" && !this.hasImage(p.image))
          return "no such image";
        sql.exec(
          `UPDATE notes SET
             title = ?, body = ?, tags = ?, color = ?, maps_url = ?, pin_lat = ?, pin_lng = ?,
             sched_date = ?, sched_time = ?, sched_status = ?, budget = ?, checked = ?, image = ?,
             x = ?, y = ?, rot = ?, updated_at = ?
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
          has("x") ? p.x : row.x,
          has("y") ? p.y : row.y,
          has("rot") ? p.rot : row.rot,
          now,
          m.id,
        );
        return m;
      }
      case "note:recolor": {
        if (this.note(m.id) === undefined) return "no such note";
        sql.exec("UPDATE notes SET color = ?, updated_at = ? WHERE id = ?", m.color, now, m.id);
        return m;
      }
      case "note:adopt": {
        const row = this.note(m.id);
        if (row === undefined) return "no such note";
        if (row.kind !== "suggestion") return "not a suggestion";
        sql.exec(
          `UPDATE notes SET kind = 'memo', color = '#ffffff', body = '', tags = '[]', maps_url = NULL,
             pin_lat = NULL, pin_lng = NULL, sched_date = NULL, sched_time = NULL, sched_status = NULL,
             budget = NULL, checked = 0, updated_at = ? WHERE id = ?`,
          now,
          m.id,
        );
        return m;
      }
      case "note:move": {
        if (this.note(m.id) === undefined) return "no such note";
        sql.exec("UPDATE notes SET x = ?, y = ?, updated_at = ? WHERE id = ?", m.x, m.y, now, m.id);
        return m;
      }
      case "note:delete": {
        if (this.note(m.id) === undefined) return "no such note";
        sql.exec("UPDATE notes SET deleted_at = ? WHERE id = ?", now, m.id);
        return m;
      }
      case "day:intro": {
        const n = sql.exec("UPDATE days SET intro = ? WHERE date = ?", m.intro, m.date).rowsWritten;
        return n === 0 ? "no such day" : m;
      }
      case "member:profile": {
        sql.exec("UPDATE members SET name = ?, color = ? WHERE id = ?", m.name, m.color, by);
        return m;
      }
    }
  }

  private withinRate(member: string): boolean {
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

  private assertMember(id: string): void {
    const row = this.ctx.storage.sql
      .exec<{ kind: MemberKind }>("SELECT kind FROM members WHERE id = ?", id)
      .toArray()[0];
    if (row === undefined || row.kind !== "person") throw new Error("not a member");
  }
}

const fromRow = (r: NoteRow): WireNote => {
  const card = {
    id: r.id,
    title: r.title,
    color: r.color as WireNote["color"],
    x: r.x,
    y: r.y,
    rot: r.rot,
    by: r.by,
    updatedAt: r.updated_at,
  };
  if (r.kind === "suggestion") return { ...card, kind: "suggestion" };
  return {
    ...card,
    kind: "memo",
    body: r.body,
    tags: JSON.parse(r.tags) as string[],
    mapsUrl: r.maps_url,
    pin: r.pin_lat === null || r.pin_lng === null ? null : { lat: r.pin_lat, lng: r.pin_lng },
    schedule:
      r.sched_date === null || r.sched_status === null
        ? null
        : { date: r.sched_date, time: r.sched_time, status: r.sched_status as NoteStatus },
    budget: r.budget,
    checked: r.checked === 1,
    image: r.image ?? null,
  };
};
