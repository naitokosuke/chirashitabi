import { describe, expect, test } from "vite-plus/test";

import {
  admit,
  APP,
  connect,
  createRoom,
  ME,
  me,
  memo,
  PARTNER,
  post,
  server,
  STRANGER,
  token,
  TRIP,
  upgrade,
  useWorker,
} from "./harness";

useWorker();

describe("the socket", () => {
  test("a member connects and gets the snapshot: who they are, who is here, the trip, no notes", async () => {
    const { roomId, memberId } = await createRoom(ME);
    const { snapshot, ws } = await connect(roomId, ME);
    expect(snapshot).toEqual({
      type: "snapshot",
      me: memberId,
      members: [
        { id: memberId, kind: "person", role: "owner", name: "Yuki", color: "#3c6ee0" },
        { id: "agent:claude", kind: "agent", name: "Claude", color: "#d97757" },
      ],
      trip: {
        ...TRIP,
        days: TRIP.days.map((date) => ({ date, intro: "" })),
        flights: { out: null, back: null },
        stays: [],
      },
      notes: [],
    });
    ws.close(1000, "done");
  });

  test("not a member: no socket", async () => {
    const { roomId } = await createRoom(ME);
    expect((await upgrade(roomId, STRANGER)).status).toBe(403);
  });

  test("the upgrade needs the Origin too", async () => {
    const { roomId } = await createRoom(ME);
    const res = await server.fetch(`${APP}/api/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket", "Cf-Access-Jwt-Assertion": await token(ME) },
    });
    expect(res.status).toBe(403);
  });

  test("a note one member adds reaches the other, stamped by the room, and is in the next snapshot", async () => {
    const { roomId, memberId: yuki } = await createRoom(ME);
    const { memberId: ken } = (await (await admit(roomId, ME, PARTNER)).json()) as {
      memberId: string;
    };
    const a = await connect(roomId, ME);
    const b = await connect(roomId, PARTNER);
    expect(b.snapshot.me).toBe(ken);

    a.send({ type: "note:add", note: memo("n1") });
    const got = await b.next();
    expect(got.type).toBe("mutation");
    if (got.type !== "mutation") return;
    expect(got.by).toBe(yuki);
    expect(got.mutation.type).toBe("note:add");
    if (got.mutation.type !== "note:add") return;
    expect(got.mutation.note.by).toBe(yuki); // not "forged"
    expect(got.mutation.note.updatedAt).toBe(got.updatedAt);
    expect(Date.parse(got.updatedAt)).toBeGreaterThan(Date.parse("2026-01-01"));
    await a.idle(); // the sender applied it locally and hears nothing back

    const c = await connect(roomId, PARTNER);
    // a memo from a client that does not say how long it takes takes no time it was not given
    expect(c.snapshot.notes).toEqual([
      {
        ...memo("n1"),
        minutes: null,
        hours: null,
        link: null,
        booking: null,
        due: null,
        assignee: null,
        by: yuki,
        updatedAt: got.updatedAt,
      },
    ]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a text box is written on the desk, rewritten, resized and taken away", async () => {
    const owner = "text-owner@example.com";
    const partner = "text-partner@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, partner)).status).toBe(200);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);
    const box = {
      id: "t1",
      kind: "text",
      text: "Day 1",
      x: 5,
      y: 6,
      rot: 0,
      scale: 1,
    };

    a.send({ type: "note:add", note: box, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    expect(await b.next()).toMatchObject({
      mutation: { type: "note:add", note: { kind: "text" } },
    });
    a.send({ type: "text:edit", id: "t1", text: "Day 1 · Taipei" });
    await b.next();
    a.send({ type: "note:move", id: "t1", x: 50, y: 60, scale: 2, cid: "c1b" });
    await a.next();
    await b.next();
    a.send({ type: "text:edit", id: "t1", text: "x".repeat(1001), cid: "c2" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation" });
    a.send({ type: "note:add", note: memo("m1"), cid: "c3" });
    await a.next();
    await b.next();
    a.send({ type: "text:edit", id: "m1", text: "x", cid: "c4" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a text box" });
    // it has no paper to color
    a.send({ type: "note:recolor", id: "t1", color: "#ffd9de", cid: "c5" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not on paper" });

    const c = await connect(roomId, partner);
    expect(c.snapshot.notes[0]).toEqual({
      id: "t1",
      kind: "text",
      text: "Day 1 · Taipei",
      x: 50,
      y: 60,
      rot: 0,
      scale: 2,
      // beside it, what a tab on the previous build reads
      title: "Day 1 · Taipei",
      color: "#ffffff",
      by: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(c.snapshot.notes[1]).toMatchObject({ id: "m1" });
    a.send({ type: "note:delete", id: "t1" });
    await b.next();
    const d = await connect(roomId, partner);
    expect(d.snapshot).toMatchObject({ notes: [{ id: "m1" }] });
    // a client from before each kind had only its own fields says the words as a title, on
    // white paper: read as the words, and told as them (with the title beside, for the previous build)
    const where = { id: "t3", kind: "text", x: 5, y: 6, rot: 0, scale: 1 };
    a.send({
      type: "note:add",
      note: { ...where, title: "Day 2", color: "#ffffff" },
      cid: "c6",
    });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c6" });
    const told = await b.next();
    expect(told.type === "mutation" && told.mutation).toEqual({
      type: "note:add",
      note: {
        ...where,
        text: "Day 2",
        title: "Day 2",
        color: "#ffffff",
        by: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    // the room's list counts memos, not words on the desk
    expect((await me(owner)).rooms).toMatchObject([{ memos: 1 }]);
    for (const s of [a, b, c, d]) s.ws.close(1000, "done");
  });

  test("how long a memo takes is kept, changed and taken back; past a day it is refused", async () => {
    const LONG = "minutes@example.com";
    const { roomId } = await createRoom(LONG);
    const a = await connect(roomId, LONG);
    a.send({ type: "note:add", note: { ...memo("n1"), minutes: 90 }, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.send({ type: "note:update", id: "n1", patch: { minutes: 1441 }, cid: "c2" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c2" });
    a.send({ type: "note:update", id: "n1", patch: { body: "lunch" }, cid: "c3" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c3" });
    const b = await connect(roomId, LONG);
    // a patch that does not name it keeps it
    expect(b.snapshot.notes).toMatchObject([{ id: "n1", minutes: 90, body: "lunch" }]);
    a.send({ type: "note:update", id: "n1", patch: { minutes: null }, cid: "c4" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c4" });
    const c = await connect(roomId, LONG);
    expect(c.snapshot.notes).toMatchObject([{ id: "n1", minutes: null }]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("when a memo's place is open is kept as written, trimmed; blank is refused", async () => {
    const OPEN = "hours@example.com";
    const { roomId } = await createRoom(OPEN);
    const a = await connect(roomId, OPEN);
    a.send({ type: "note:add", note: { ...memo("n1"), hours: " Mo-Fr 10:00-20:00 " }, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.send({ type: "note:update", id: "n1", patch: { hours: "  " }, cid: "c2" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c2" });
    const b = await connect(roomId, OPEN);
    expect(b.snapshot.notes).toMatchObject([{ id: "n1", hours: "Mo-Fr 10:00-20:00" }]);
    a.send({ type: "note:update", id: "n1", patch: { hours: null }, cid: "c3" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c3" });
    const c = await connect(roomId, OPEN);
    expect(c.snapshot.notes).toMatchObject([{ id: "n1", hours: null }]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a booking is kept as its state says: by when while to book, its number and page once booked", async () => {
    const BOOK = "booking@example.com";
    const { roomId } = await createRoom(BOOK);
    const a = await connect(roomId, BOOK);
    const needed = { state: "needed", by: "2026-10-20" };
    a.send({ type: "note:add", note: { ...memo("n1"), booking: needed }, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    const b = await connect(roomId, BOOK);
    expect(b.snapshot.notes).toMatchObject([{ id: "n1", booking: needed }]);
    // a booked one has no day to book by; a state it does not know is refused
    const booked = { state: "booked", code: " ABC123 ", url: "https://example.com/r/1" };
    a.send({ type: "note:update", id: "n1", patch: { booking: booked }, cid: "c2" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c2" });
    const odd = { state: "maybe", by: null };
    a.send({ type: "note:update", id: "n1", patch: { booking: odd }, cid: "c3" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c3" });
    const c = await connect(roomId, BOOK);
    expect(c.snapshot.notes).toMatchObject([
      { id: "n1", booking: { state: "booked", code: "ABC123", url: "https://example.com/r/1" } },
    ]);
    a.send({ type: "note:update", id: "n1", patch: { booking: null }, cid: "c4" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c4" });
    const d = await connect(roomId, BOOK);
    expect(d.snapshot.notes).toMatchObject([{ id: "n1", booking: null }]);
    for (const s of [a, b, c, d]) s.ws.close(1000, "done");
  });

  test("a to-do keeps the day it is due by and who is to do it", async () => {
    const TODO = "todo@example.com";
    const { roomId, memberId } = await createRoom(TODO);
    const a = await connect(roomId, TODO);
    const todo = {
      ...memo("n1", "Change money"),
      tags: ["To do"],
      due: "2026-10-30",
      assignee: memberId,
    };
    a.send({ type: "note:add", note: todo, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c1" });
    a.send({ type: "note:update", id: "n1", patch: { due: "2026-02-30" }, cid: "c2" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c2" });
    const b = await connect(roomId, TODO);
    expect(b.snapshot.notes).toMatchObject([{ id: "n1", due: "2026-10-30", assignee: memberId }]);
    a.send({ type: "note:update", id: "n1", patch: { due: null, assignee: null }, cid: "c3" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "c3" });
    const c = await connect(roomId, TODO);
    expect(c.snapshot.notes).toMatchObject([{ id: "n1", due: null, assignee: null }]);
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("updates, moves, recolors, adoption, deletion and the day intro all land", async () => {
    const { roomId, memberId: yuki } = await createRoom(ME);
    await admit(roomId, ME, PARTNER);
    const a = await connect(roomId, ME);
    const b = await connect(roomId, PARTNER);
    const after = async (m: Record<string, unknown>) => {
      a.send(m);
      const got = await b.next();
      if (got.type !== "mutation") throw new Error(got.type);
      return got.mutation;
    };

    await after({ type: "note:add", note: memo("n1") });
    await after({
      type: "note:add",
      note: { ...memo("s1", "Try the night market"), kind: "suggestion" },
    });
    expect(
      await after({ type: "note:update", id: "n1", patch: { body: "lunch", budget: 600 } }),
    ).toEqual({
      type: "note:update",
      id: "n1",
      patch: { body: "lunch", budget: 600 },
    });
    await after({ type: "note:move", id: "n1", x: 300, y: 400 });
    await after({ type: "note:recolor", id: "n1", color: "#dbe7ff" });
    await after({ type: "note:adopt", id: "s1" });
    await after({ type: "day:intro", date: "2026-11-04", intro: "Jiufen day" });
    await after({ type: "member:profile", name: "Yuki K", color: "#112233" });
    await after({ type: "note:delete", id: "n1" });

    const c = await connect(roomId, ME);
    expect(c.snapshot.notes).toEqual([
      {
        id: "s1",
        kind: "memo",
        title: "Try the night market",
        color: "#ffffff",
        x: 10,
        y: 20,
        rot: 0,
        scale: 1,
        by: yuki,
        updatedAt: expect.any(String),
        body: "",
        tags: [],
        mapsUrl: null,
        pin: null,
        schedule: null,
        budget: null,
        checked: false,
        image: null,
        minutes: null,
        hours: null,
        link: null,
        booking: null,
        due: null,
        assignee: null,
      },
    ]);
    expect(c.snapshot.trip.days[1]).toEqual({ date: "2026-11-04", intro: "Jiufen day" });
    expect(c.snapshot.members[0]).toEqual({
      id: yuki,
      kind: "person",
      role: "owner",
      name: "Yuki K",
      color: "#112233",
    });
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a tick in the appendix reaches the other member and stays; an older client's note is unticked", async () => {
    const { roomId } = await createRoom(ME);
    await admit(roomId, ME, PARTNER);
    const a = await connect(roomId, ME);
    const b = await connect(roomId, PARTNER);
    const { checked: _, ...older } = { ...memo("p1", "Passport"), tags: ["Packing"] };
    a.send({ type: "note:add", note: older });
    await b.next();
    a.send({ type: "note:update", id: "p1", patch: { checked: true } });
    const got = await b.next();
    expect(got.type === "mutation" && got.mutation).toEqual({
      type: "note:update",
      id: "p1",
      patch: { checked: true },
    });
    const c = await connect(roomId, PARTNER);
    expect(c.snapshot.notes.map((n) => n.kind === "memo" && n.checked)).toEqual([true]);
    a.send({ type: "note:update", id: "p1", patch: { checked: "yes" } });
    const refused = await a.next();
    expect(refused).toEqual({ type: "rejected", reason: "not a mutation" });
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("new dates move the days' intros and what is planned; a plan past the new end loses its day", async () => {
    const owner = "dates-owner@example.com";
    const { roomId } = await createRoom(owner); // 11/3, 11/4, 11/5
    const a = await connect(roomId, owner);
    a.send({ type: "day:intro", date: "2026-11-04", intro: "Jiufen", cid: "i" });
    await a.next();
    const on = (date: string) => ({
      ...memo(`m${date}`),
      schedule: { date, time: null, status: "fixed" },
    });
    for (const date of ["2026-11-03", "2026-11-05"]) {
      a.send({ type: "note:add", note: on(date), cid: date });
      await a.next();
    }
    // a week later, two days long: day 2 keeps its intro, 11/3 moves to 11/10, 11/5 falls off
    a.send({ type: "trip:dates", first: "2026-11-10", days: 2, cid: "d" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "d" });
    for (const bad of [
      { first: "2026-02-30", days: 2 },
      { first: "2026-11-10", days: 0 },
      { first: "2026-11-10", days: 61 },
    ]) {
      a.send({ type: "trip:dates", ...bad });
      expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation" });
    }
    // a trip running past 9999-12-31 has days no date can be written for, and nothing moves
    a.send({ type: "trip:dates", first: "9999-12-01", days: 60, cid: "far" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "no such day", cid: "far" });

    const b = await connect(roomId, owner);
    expect(b.snapshot).toMatchObject({
      trip: {
        days: [
          { date: "2026-11-10", intro: "" },
          { date: "2026-11-11", intro: "Jiufen" },
        ],
      },
      notes: [
        { id: "m2026-11-03", schedule: { date: "2026-11-10", status: "fixed" } },
        { id: "m2026-11-05", schedule: null },
      ],
    });
    expect((await me(owner)).rooms).toMatchObject([{ first: "2026-11-10", days: 2 }]);
    for (const s of [a, b]) s.ws.close(1000, "done");
  });

  test("the stays are saved as a list, checked, and kept in order", async () => {
    const owner = "stay-owner@example.com";
    const partner = "stay-partner@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, partner)).status).toBe(200);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);
    const stay = {
      name: " Hotel Proverbs ",
      checkIn: "2026-11-03",
      nights: 2,
      mapsUrl: "https://maps.google.com/?q=25.04,121.55",
      pin: { lat: 25.04, lng: 121.55 },
    };
    const second = {
      name: "Jiufen inn",
      checkIn: "2026-11-05",
      nights: 1,
      mapsUrl: null,
      pin: null,
    };

    a.send({ type: "trip:stays", stays: [stay, second], cid: "s" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "s" });
    expect(await b.next()).toMatchObject({
      mutation: { type: "trip:stays", stays: [{ name: "Hotel Proverbs" }, { name: "Jiufen inn" }] },
    });
    for (const bad of [
      [{ ...stay, name: " " }],
      [{ ...stay, checkIn: "11/3" }],
      [{ ...stay, nights: 0 }],
      [{ ...stay, nights: 1.5 }],
      [{ ...stay, mapsUrl: "javascript:alert(1)" }],
      [{ ...stay, pin: { lat: 91, lng: 0 } }],
      Array.from({ length: 61 }, () => second),
    ]) {
      a.send({ type: "trip:stays", stays: bad });
      expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation" });
    }

    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({
      trip: {
        stays: [
          {
            name: "Hotel Proverbs",
            checkIn: "2026-11-03",
            nights: 2,
            mapsUrl: stay.mapsUrl,
            pin: stay.pin,
          },
          second,
        ],
      },
    });
    a.send({ type: "trip:stays", stays: [] });
    await b.next();
    const d = await connect(roomId, owner);
    expect(d.snapshot).toMatchObject({ trip: { stays: [] } });
    for (const s of [a, b, c, d]) s.ws.close(1000, "done");
  });

  test("a flight is set from its ticket, changed, and taken away", async () => {
    const owner = "flight-owner@example.com";
    const partner = "flight-partner@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, partner)).status).toBe(200);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);
    const flight = {
      number: " BR 191 ",
      from: "HND",
      to: "TSA",
      departs: "2026-11-03T08:50:00",
      arrives: "2026-11-03T11:30",
    };

    a.send({ type: "trip:flight", leg: "out", flight, cid: "f" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "f" });
    expect(await b.next()).toMatchObject({
      mutation: {
        type: "trip:flight",
        leg: "out",
        flight: { number: "BR 191", departs: "2026-11-03T08:50" },
      },
    });
    a.send({
      type: "trip:flight",
      leg: "back",
      flight: { ...flight, from: "TSA", to: "HND", departs: "2026-11-05T17:00" },
    });
    await b.next();
    for (const bad of [
      { leg: "sideways", flight },
      { leg: "out", flight: { ...flight, from: " " } },
      // an airport is a code on the list, exactly: not a name, not another case, not made up
      { leg: "out", flight: { ...flight, from: "羽田" } },
      { leg: "out", flight: { ...flight, from: "hnd" } },
      { leg: "out", flight: { ...flight, to: "ZZZ" } },
      { leg: "out", flight: { ...flight, departs: "11/3 8:50" } },
      { leg: "out", flight: { ...flight, number: "x".repeat(21) } },
    ]) {
      a.send({ type: "trip:flight", ...bad });
      expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation" });
    }
    a.send({ type: "trip:flight", leg: "out", flight: null });
    await b.next();

    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({
      trip: {
        flights: {
          out: null,
          back: {
            number: "BR 191",
            from: "TSA",
            to: "HND",
            departs: "2026-11-05T17:00",
            arrives: "2026-11-03T11:30",
          },
        },
      },
    });

    // only the airports are needed: the number and the times may wait for the ticket
    a.send({
      type: "trip:flight",
      leg: "out",
      flight: { number: "", from: "HND", to: "TSA", departs: null, arrives: null },
      cid: "bare",
    });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "bare" });
    await b.next();
    const d = await connect(roomId, partner);
    expect(d.snapshot).toMatchObject({
      trip: {
        flights: { out: { number: "", from: "HND", to: "TSA", departs: null, arrives: null } },
      },
    });
    for (const s of [a, b, c, d]) s.ws.close(1000, "done");
  });

  test("the trip's name, written on the desk, reaches the other member and the list of trips", async () => {
    const owner = "rename-owner@example.com";
    const partner = "rename-partner@example.com";
    const { roomId } = await createRoom(owner);
    await admit(roomId, owner, partner);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);

    a.send({ type: "trip:rename", name: "  台湾の秋  ", cid: "r1" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "r1" });
    expect(await b.next()).toMatchObject({
      type: "mutation",
      mutation: { type: "trip:rename", name: "台湾の秋" },
    });
    for (const name of ["   ", "x".repeat(61)]) {
      a.send({ type: "trip:rename", name });
      expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation" });
    }
    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({ trip: { name: "台湾の秋" } });
    const list = (await (await post("/api/me", partner)).json()) as { rooms: { name: string }[] };
    expect(list.rooms.map((r) => r.name)).toEqual(["台湾の秋"]);
    await b.idle();
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("what the room refuses, with the reason, and nobody else hears", async () => {
    const { roomId } = await createRoom(ME);
    await admit(roomId, ME, PARTNER);
    const a = await connect(roomId, ME);
    const b = await connect(roomId, PARTNER);
    const refused = async (m: unknown) => {
      a.send(m);
      const got = await a.next();
      if (got.type !== "rejected" && got.type !== "unread") throw new Error(got.type);
      return got.reason;
    };

    expect(await refused("not json")).toBe("not JSON");
    expect(await refused({ type: "note:eat", id: "n1" })).toBe("not a mutation");
    expect(await refused({ type: "note:add", note: { ...memo("n1"), color: "red" } })).toBe(
      "not a mutation",
    );
    expect(await refused({ type: "note:update", id: "n1", patch: { by: "me" } })).toBe(
      "not a mutation",
    );
    expect(await refused({ type: "note:update", id: "nope", patch: { body: "x" } })).toBe(
      "no such note",
    );
    expect(await refused({ type: "day:intro", date: "2026-12-25", intro: "x" })).toBe(
      "no such day",
    );
    expect(
      await refused({ type: "note:add", note: { ...memo("big"), title: "x".repeat(70_000) } }),
    ).toBe("too large");
    // the limit is in bytes: 25,000 characters of three bytes each are 75 KB
    expect(await refused("あ".repeat(25_000))).toBe("too large");
    await b.idle();
    for (const s of [a, b]) s.ws.close(1000, "done");
  });

  test("a mutation with a cid is answered to its sender: ack with the room's time, or rejected with the cid", async () => {
    // its own people: the others above have used up what one e-mail may hold
    const owner = "acks@example.com";
    const partner = "acks-partner@example.com";
    const { roomId } = await createRoom(owner);
    await admit(roomId, owner, partner);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);

    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    const ack = await a.next();
    const relayed = await b.next();
    expect(ack).toEqual({ type: "ack", cid: "c1", updatedAt: expect.any(String) });
    // the partner hears the mutation as before, without the cid, at the same time
    expect(relayed.type === "mutation" && relayed.updatedAt).toBe(
      ack.type === "ack" && ack.updatedAt,
    );
    expect(relayed.type === "mutation" && "cid" in relayed.mutation).toBe(false);

    a.send({ type: "note:add", note: memo("n1"), cid: "c2" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "duplicate id", cid: "c2" });
    a.send({ type: "note:eat", cid: "c3" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation", cid: "c3" });
    // a cid that is not an id is ignored, and the answer is the old unnamed one
    a.send({ type: "note:eat", cid: "no spaces allowed" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "not a mutation" });

    a.send({ type: "note:move", id: "n1", x: 1, y: 2 }); // no cid: relayed, not answered
    expect((await b.next()).type).toBe("mutation");
    await a.idle();
    await b.idle();
    for (const s of [a, b]) s.ws.close(1000, "done");

    // nor kept: whoever opens the room next finds the card where it was before the drag
    const c = await connect(roomId, partner);
    expect(c.snapshot.type === "snapshot" && c.snapshot.notes).toMatchObject([
      { id: "n1", x: 10, y: 20 },
    ]);
    c.ws.close(1000, "done");
  });

  test("a deleted note keeps its id: adding it again is answered as a duplicate", async () => {
    const email = "readd@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:delete", id: "n1", cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:add", note: memo("n1"), cid: "c3" });
    expect(await a.next()).toEqual({ type: "rejected", reason: "duplicate id", cid: "c3" });
    a.ws.close(1000, "done");
  });

  test("a change sent again after its ack was lost is acked as before, and not written over what came since", async () => {
    const owner = "replay@example.com";
    const partner = "replay-partner@example.com";
    const { roomId } = await createRoom(owner);
    await admit(roomId, owner, partner);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, partner);
    a.send({ type: "note:add", note: memo("n1"), cid: "add" });
    const added = await a.next();
    await b.next();
    a.send({ type: "note:update", id: "n1", patch: { title: "Mine" }, cid: "mine" });
    const updated = await a.next();
    await b.next();
    b.send({ type: "note:update", id: "n1", patch: { title: "Theirs" }, cid: "theirs" });
    await b.next();
    await a.next();

    // the phone comes back and sends again what it never heard answered
    a.ws.close(1000, "lost");
    const again = await connect(roomId, owner);
    again.send({ type: "note:add", note: memo("n1"), cid: "add" });
    expect(await again.next()).toEqual(added);
    again.send({ type: "note:update", id: "n1", patch: { title: "Mine" }, cid: "mine" });
    expect(await again.next()).toEqual(updated);
    // the partner hears nothing of either: the next thing they hear is a new change
    again.send({ type: "note:recolor", id: "n1", color: "#ffffff", cid: "new" });
    expect(await b.next()).toMatchObject({ type: "mutation", mutation: { type: "note:recolor" } });
    // a cid is the sender's own: the partner's same one is a change of its own
    b.send({ type: "note:add", note: memo("n2"), cid: "add" });
    expect(await b.next()).toMatchObject({ type: "ack", cid: "add" });

    const c = await connect(roomId, partner);
    expect(c.snapshot).toMatchObject({ notes: [{ id: "n1", title: "Theirs" }, { id: "n2" }] });
    for (const s of [again, b, c]) s.ws.close(1000, "done");
  });

  test("a long drag does not crowd out the change that ends it", async () => {
    const email = "long-drag@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    // as many moves under the finger as a window takes, then letting go
    for (let i = 0; i < 200; i++) a.send({ type: "note:move", id: "n1", x: i, y: i });
    a.send({ type: "note:move", id: "n1", x: 5, y: 5, cid: "let-go" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "let-go" });
    a.ws.close(1000, "done");
  });

  test("a card under a finger that is gone, or past the window, is dropped without an answer", async () => {
    const email = "gone-drag@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    // the partner deleted it a moment ago
    a.send({ type: "note:move", id: "gone", x: 1, y: 2 });
    // more moves than a window takes
    for (let i = 0; i < 210; i++) a.send({ type: "note:move", id: "n1", x: i, y: i });
    // the next thing the sender hears is the answer to its next change: no refusal came before it
    a.send({ type: "note:move", id: "n1", x: 5, y: 5, cid: "let-go" });
    expect(await a.next()).toMatchObject({ type: "ack", cid: "let-go" });
    a.ws.close(1000, "done");
  });
});

describe("turning and resizing a card", () => {
  test("a move may say how the card is turned and how large; one that does not keeps both", async () => {
    const email = "shapes@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:move", id: "n1", x: 50, y: 60, rot: -30, scale: 1.8, cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:move", id: "n1", x: 70, y: 80, cid: "c3" });
    expect((await a.next()).type).toBe("ack");
    // too small, too large, or not a number: refused, and nothing changes
    for (const scale of [0.1, 9, "big"]) {
      a.send({ type: "note:move", id: "n1", x: 0, y: 0, scale, cid: "bad" });
      expect(await a.next()).toMatchObject({ type: "rejected", cid: "bad" });
    }
    a.ws.close(1000, "done");

    const b = await connect(roomId, email);
    const n1 = b.snapshot.type === "snapshot" ? b.snapshot.notes.find((n) => n.id === "n1") : null;
    expect(n1).toMatchObject({ x: 70, y: 80, rot: -30, scale: 1.8 });
    b.ws.close(1000, "done");
  });
});
