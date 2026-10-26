import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { ServerMessageSchema } from "../../contract/wire";

import { connect, createRoom, memo, roomStorage, server, useWorker } from "./harness";

useWorker();

describe("a room from before, and rows written past the checks", () => {
  test("a room from before stickers takes them once its notes are copied over", async () => {
    const owner = "old-sticker-room@example.com";
    const { roomId } = await createRoom(owner);
    const worker = server.getWorker();
    const room = await roomStorage(roomId);
    // the notes table as it was: a CHECK without 'sticker', with a text box in it
    await room.exec("DROP TABLE notes");
    await room.exec(`CREATE TABLE notes (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('memo', 'suggestion', 'text')),
      title TEXT NOT NULL, color TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, rot REAL NOT NULL,
      by TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]', maps_url TEXT, pin_lat REAL, pin_lng REAL, sched_date TEXT,
      sched_time TEXT, sched_status TEXT, budget REAL, deleted_at TEXT,
      checked INTEGER NOT NULL DEFAULT 0, image TEXT, scale REAL NOT NULL DEFAULT 1)`);
    await room.exec(
      `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at)
       VALUES ('old', 'text', 'Kept', '#ffffff', 1, 2, 3, 'agent:claude', '2026-01-01T00:00:00Z')`,
    );
    await worker.evictDurableObject("Room", { name: roomId });

    const a = await connect(roomId, owner);
    expect(a.snapshot).toMatchObject({ notes: [{ id: "old", kind: "text", text: "Kept" }] });
    a.ws.close(1000, "done");
  });

  test("a room from before null times keeps its flights, an unknown time now null", async () => {
    const owner = "old-flight-room@example.com";
    const { roomId } = await createRoom(owner);
    const worker = server.getWorker();
    const room = await roomStorage(roomId);
    // the flights table as it was: times NOT NULL, one not known yet written ""
    await room.exec("DROP TABLE flights");
    await room.exec(`CREATE TABLE flights (
      leg TEXT PRIMARY KEY CHECK (leg IN ('out', 'back')), number TEXT NOT NULL,
      from_place TEXT NOT NULL, to_place TEXT NOT NULL, departs TEXT NOT NULL, arrives TEXT NOT NULL)`);
    await room.exec(
      `INSERT INTO flights (leg, number, from_place, to_place, departs, arrives)
       VALUES ('out', 'BR 191', 'HND', 'TSA', '2026-11-03T08:50', '')`,
    );
    await worker.evictDurableObject("Room", { name: roomId });

    const a = await connect(roomId, owner);
    expect(a.snapshot).toMatchObject({
      trip: {
        flights: {
          out: { number: "BR 191", departs: "2026-11-03T08:50", arrives: null },
          back: null,
        },
      },
    });
    a.ws.close(1000, "done");
  });

  test("a room from before text boxes takes them once its notes are copied over", async () => {
    const owner = "old-room@example.com";
    const { roomId } = await createRoom(owner);
    const worker = server.getWorker();
    const room = await roomStorage(roomId);
    // the notes table as it was: a CHECK without 'text', with a memo in it
    await room.exec("DROP TABLE notes");
    await room.exec(`CREATE TABLE notes (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('memo', 'suggestion')),
      title TEXT NOT NULL, color TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, rot REAL NOT NULL,
      by TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]', maps_url TEXT, pin_lat REAL, pin_lng REAL, sched_date TEXT,
      sched_time TEXT, sched_status TEXT, budget REAL, deleted_at TEXT,
      checked INTEGER NOT NULL DEFAULT 0, image TEXT, scale REAL NOT NULL DEFAULT 1)`);
    await room.exec(
      `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at, tags, checked)
       VALUES ('old', 'memo', 'Kept', '#fff1b8', 1, 2, 3, 'agent:claude', '2026-01-01T00:00:00Z', '["Food"]', 1)`,
    );
    await worker.evictDurableObject("Room", { name: roomId });

    const a = await connect(roomId, owner);
    expect(a.snapshot).toMatchObject({
      notes: [
        {
          id: "old",
          title: "Kept",
          tags: ["Food"],
          checked: true,
          rot: 3,
          minutes: null,
          hours: null,
          link: null,
          booking: null,
          due: null,
          assignee: null,
        },
      ],
    });
    const box = {
      id: "t2",
      kind: "text",
      text: "Hi",
      x: 0,
      y: 0,
      rot: 0,
      scale: 1,
    };
    a.send({ type: "note:add", note: box, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.ws.close(1000, "done");
  });

  test("notes from before a check are repaired once: a field the contract refuses cleared, a note with nothing to fall back to deleted", async () => {
    const owner = "repaired-room@example.com";
    const { roomId } = await createRoom(owner);
    const worker = server.getWorker();
    const room = await roomStorage(roomId);
    const row = (id: string, kind: string, title: string, by = "agent:claude") =>
      room.exec(
        `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at)
         VALUES (?, ?, ?, '#ffffff', 1, 2, 3, ?, '2026-01-01T00:00:00Z')`,
        id,
        kind,
        title,
        by,
      );
    // a text box left blank before its words had to be there; a memo whose link and hours a
    // check now refuses; a sticker whose picture is no id; one no one wrote; and a sound memo
    await row("blank", "text", "  ");
    await row("worn", "memo", "Kept");
    await room.exec(
      "UPDATE notes SET link = 'javascript:alert(1)', hours = ? WHERE id = 'worn'",
      "x".repeat(300),
    );
    await row("torn", "sticker", "");
    await room.exec("UPDATE notes SET image = 'not-an-id' WHERE id = 'torn'");
    await row("nobody", "memo", "Who", "someone");
    await row("sound", "memo", "Fine");
    // a room from before the repairs: it has never been repaired
    await room.exec("DROP TABLE repaired");
    await worker.evictDurableObject("Room", { name: roomId });

    const a = await connect(roomId, owner);
    const notes = a.snapshot.type === "snapshot" ? a.snapshot.notes : [];
    expect(notes.map((n) => n.id)).toEqual(["worn", "sound"]);
    expect(notes[0]).toMatchObject({ id: "worn", title: "Kept", link: null, hours: null, rot: 3 });
    // deleted as a member deletes one: its id is not made again
    a.send({ type: "note:add", note: { ...memo("blank"), kind: "memo" }, cid: "c1" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "duplicate id", cid: "c1" });
    a.ws.close(1000, "done");
    expect(await room.exec("SELECT version FROM repaired")).toEqual([{ version: 1 }]);
  });

  test("a note or a member that does not read is left out of the snapshot, and the room still opens", async () => {
    const owner = "unread-rows@example.com";
    const { roomId } = await createRoom(owner);
    const room = await roomStorage(roomId);
    const a = await connect(roomId, owner);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.ws.close(1000, "done");
    // written past the checks, after the room's repair has run
    await room.exec(
      `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at)
       VALUES ('bad', 'text', '', '#ffffff', 1, 2, 3, 'agent:claude', '2026-01-01T00:00:00Z')`,
    );
    await room.exec(
      "INSERT INTO members (id, kind, name, color) VALUES ('0f8fad5b-d9cb-469f-a165-70867728950e', 'person', 'Odd', 'red')",
    );
    await room.exec(
      "INSERT INTO stays (position, name, check_in, nights) VALUES (9, 'Nowhere', 'someday', 1)",
    );

    const b = await connect(roomId, owner);
    expect(v.parse(ServerMessageSchema, b.snapshot)).toMatchObject({
      type: "snapshot",
      notes: [{ id: "n1" }],
      trip: { stays: [] },
    });
    const members = b.snapshot.type === "snapshot" ? b.snapshot.members : [];
    expect(members.map((m) => m.name)).not.toContain("Odd");
    b.ws.close(1000, "done");
  });
});
