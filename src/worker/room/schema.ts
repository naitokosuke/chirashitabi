import { airportCodeOf } from "../../contract/airport";

import { ON_DESK, repairOf, type NoteRow } from "./notes";

/**
 * Makes the tables every room has, and brings those an earlier build made up to what this one
 * reads; each step runs once a room, and does nothing after
 */
export const migrate = (storage: DurableObjectStorage): void => {
  storage.sql.exec(`
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
  storage.sql.exec(notesTable("notes"));
  // Rooms made before the appendix's checks were shared gain the column once
  const cols = storage.sql.exec<{ name: string }>("PRAGMA table_info(notes)").toArray();
  if (!cols.some((c) => c.name === "checked")) {
    storage.sql.exec("ALTER TABLE notes ADD COLUMN checked INTEGER NOT NULL DEFAULT 0");
  }
  // and the pictures on cards, once they arrived
  if (!cols.some((c) => c.name === "image")) {
    storage.sql.exec("ALTER TABLE notes ADD COLUMN image TEXT");
  }
  // and how large a card is drawn, once cards could be resized
  if (!cols.some((c) => c.name === "scale")) {
    storage.sql.exec("ALTER TABLE notes ADD COLUMN scale REAL NOT NULL DEFAULT 1");
  }
  // and how long a memo takes, once the booklet said when each thing ends
  if (!cols.some((c) => c.name === "minutes")) {
    storage.sql.exec("ALTER TABLE notes ADD COLUMN minutes INTEGER");
  }
  // and when its place is open, once that was its own rather than a line of its words
  if (!cols.some((c) => c.name === "hours")) {
    storage.sql.exec("ALTER TABLE notes ADD COLUMN hours TEXT");
  }
  // and where its idea came from, once a memo could carry a page's link
  if (!cols.some((c) => c.name === "link")) {
    storage.sql.exec("ALTER TABLE notes ADD COLUMN link TEXT");
  }
  // and whether it has to be booked, once bookings were kept
  if (!cols.some((c) => c.name === "booking_state")) {
    for (const col of ["booking_state", "booking_by", "booking_code", "booking_url"])
      storage.sql.exec(`ALTER TABLE notes ADD COLUMN ${col} TEXT`);
  }
  // and a to-do's day and who is to do it, once there were to-dos
  if (!cols.some((c) => c.name === "due")) {
    for (const col of ["due", "assignee"])
      storage.sql.exec(`ALTER TABLE notes ADD COLUMN ${col} TEXT`);
  }
  // and text boxes and stickers, once there were any: a CHECK cannot be altered, so the table
  // is copied once into one whose CHECK lets them in, every column by name
  const { sql: ddl } = storage.sql
    .exec<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notes'")
    .one();
  if (!ddl.includes("'sticker'")) {
    storage.transactionSync(() => {
      const sql = storage.sql;
      sql.exec(notesTable("notes_next"));
      sql.exec(`INSERT INTO notes_next (${NOTE_COLUMNS}) SELECT ${NOTE_COLUMNS} FROM notes`);
      sql.exec("DROP TABLE notes");
      sql.exec("ALTER TABLE notes_next RENAME TO notes");
    });
  }
  storage.sql.exec(`
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
    CREATE TABLE IF NOT EXISTS restored (
      id INTEGER PRIMARY KEY CHECK (id = 1),
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
    CREATE TABLE IF NOT EXISTS agent_calls (
      at TEXT NOT NULL,
      by TEXT NOT NULL,
      what TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL
    );
  `);
  // Rooms made before a taken seat remembered whom it let in gain the column once
  if (
    !storage.sql
      .exec<{ name: string }>("PRAGMA table_info(invitations)")
      .toArray()
      .some((c) => c.name === "member")
  ) {
    storage.sql.exec("ALTER TABLE invitations ADD COLUMN member TEXT");
  }
  storage.sql.exec(flightsTable("flights"));
  // flights kept when a time not known yet was written "" (its columns were NOT NULL then) are
  // copied once into a table where it is null, every column by name
  const { sql: flightsDdl } = storage.sql
    .exec<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'flights'",
    )
    .one();
  if (flightsDdl.includes("departs TEXT NOT NULL")) {
    storage.transactionSync(() => {
      const sql = storage.sql;
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
  // list stays as written, out of the snapshot (readTrip), until a member sets it again
  for (const f of storage.sql
    .exec<{ leg: string; from_place: string; to_place: string }>(
      "SELECT leg, from_place, to_place FROM flights",
    )
    .toArray()) {
    const from = airportCodeOf(f.from_place);
    const to = airportCodeOf(f.to_place);
    if (from === null || to === null) continue;
    if (from !== f.from_place || to !== f.to_place)
      storage.sql.exec(
        "UPDATE flights SET from_place = ?, to_place = ? WHERE leg = ?",
        from,
        to,
        f.leg,
      );
  }
  repair(storage);
};

/**
 * How far notes have been repaired against the contract; one more each time the repair does
 * more. 1: a field the contract refused was cleared. 2: words past a limit are cut to it rather
 * than cleared, a memo's tags past theirs too (which the room read as no tag), and each repair is
 * recorded. A room at 1 has every note reading already, so running the repair again does only
 * what 2 adds: the tags.
 */
const REPAIRED = 2;

/**
 * Notes kept before a check the contract has since gained, brought up to it once (each
 * REPAIRED): what the room would read only to leave out, or in part (readNotes). Words past a
 * limit are cut to it, and any other field it refuses cleared to what it takes; a note that is
 * still refused, or has nothing to fall back to (a text box left blank before its words had to be
 * there), is deleted as `note:delete` deletes one. Each is recorded in `repairs` with the columns
 * as they were, since a room's logs are not kept (wrangler.jsonc), and logged.
 */
const repair = (storage: DurableObjectStorage): void => {
  const sql = storage.sql;
  sql.exec(`
    CREATE TABLE IF NOT EXISTS repaired (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repairs (
      note_id TEXT NOT NULL,
      at TEXT NOT NULL,
      version INTEGER NOT NULL,
      deleted INTEGER NOT NULL,
      cut TEXT NOT NULL,
      cleared TEXT NOT NULL,
      before TEXT NOT NULL
    );
  `);
  const done = sql
    .exec<{ version: number }>("SELECT version FROM repaired WHERE id = 1")
    .toArray()[0];
  if (done !== undefined && done.version >= REPAIRED) return;
  storage.transactionSync(() => {
    const now = new Date().toISOString();
    const record = (
      r: NoteRow,
      deleted: boolean,
      cut: string[],
      cleared: string[],
      before: object,
    ) =>
      sql.exec(
        `INSERT INTO repairs (note_id, at, version, deleted, cut, cleared, before)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        r.id,
        now,
        REPAIRED,
        Number(deleted),
        JSON.stringify(cut),
        JSON.stringify(cleared),
        JSON.stringify(before),
      );
    for (const r of sql.exec<NoteRow>(`SELECT * FROM ${ON_DESK}`).toArray()) {
      const fix = repairOf(r);
      if (fix.kind === "fine") continue;
      if (fix.kind === "delete") {
        sql.exec("UPDATE notes SET deleted_at = ? WHERE id = ?", now, r.id);
        // the row stays, deleted, with all it kept
        record(r, true, [], [], {});
        console.warn("room: a note the contract refuses is deleted", { id: r.id, kind: r.kind });
        continue;
      }
      const columns = Object.entries(fix.columns);
      sql.exec(
        `UPDATE notes SET ${columns.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`,
        ...columns.map(([, value]) => value),
        r.id,
      );
      const before = Object.fromEntries(
        Object.entries(r).filter(([c]) => columns.some(([changed]) => changed === c)),
      );
      record(r, false, fix.cut, fix.cleared, before);
      console.warn("room: a note is repaired to the contract", {
        id: r.id,
        cut: fix.cut,
        cleared: fix.cleared,
      });
    }
    sql.exec("INSERT OR REPLACE INTO repaired (id, version) VALUES (1, ?)", REPAIRED);
  });
};

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
