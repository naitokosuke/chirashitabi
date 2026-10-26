import { describe, expect, test } from "vite-plus/test";

import {
  admit,
  connect,
  createRoom,
  invite,
  KEN,
  ME,
  me,
  memo,
  PARTNER,
  post,
  refusal,
  roomStorage,
  server,
  STRANGER,
  TRIP,
  YUKI,
  useWorker,
} from "./harness";

useWorker();

describe("rooms", () => {
  test("create sets the trip up, mints the creator and the agent, and records the membership", async () => {
    const { roomId, memberId } = await createRoom(ME);
    expect(roomId).toMatch(/^[0-9a-f-]{36}$/);

    // the creator opens it as the member they were minted, its owner, beside the agent
    const a = await connect(roomId, ME);
    expect(a.snapshot).toMatchObject({
      me: memberId,
      members: [
        { id: memberId, kind: "person", role: "owner", name: "Yuki" },
        { id: "agent:claude", kind: "agent", name: "Claude" },
      ],
      trip: {
        name: "Taiwan trip",
        currency: "TWD",
        days: TRIP.days.map((date) => ({ date })),
      },
    });
    expect(a.snapshot.type === "snapshot" ? a.snapshot.members : []).toHaveLength(2);
    a.ws.close(1000, "done");

    // and the membership is recorded: the room is on their list, as theirs
    expect((await me(ME)).rooms).toMatchObject([{ id: roomId, owner: true }]);
  });

  test("a person may be nameless: told apart by color alone", async () => {
    const res = await post("/api/rooms", ME, { trip: TRIP, me: { name: "  ", color: "#3c6ee0" } });
    expect(res.status).toBe(200);
    const { roomId, memberId } = (await res.json()) as { roomId: string; memberId: string };
    const a = await connect(roomId, ME);
    expect(a.snapshot).toMatchObject({
      members: [{ id: memberId, name: "", color: "#3c6ee0" }, { id: "agent:claude" }],
    });
    a.ws.close(1000, "done");
  });

  test.each([
    ["no trip", { me: YUKI }],
    ["no profile", { trip: TRIP }],
    ["a currency Intl does not know", { trip: { ...TRIP, currency: "XXX" }, me: YUKI }],
    ["a day that is not a date", { trip: { ...TRIP, days: ["2026-11-31"] }, me: YUKI }],
    ["no days", { trip: { ...TRIP, days: [] }, me: YUKI }],
    ["a color that is not hex", { trip: TRIP, me: { ...YUKI, color: "red" } }],
    ["a name that is not text", { trip: TRIP, me: { ...YUKI, name: 1 } }],
  ])("create refuses %s", async (_, body) => {
    expect((await post("/api/rooms", ME, body)).status).toBe(400);
  });

  test("the e-mail is matched case-insensitively", async () => {
    const { roomId } = await createRoom("Mixed.Case@Example.com");
    expect((await invite(roomId, "mixed.case@example.com", PARTNER)).status).toBe(200);
  });

  test("an unknown room is 404, a room one is not in is 403", async () => {
    const { roomId } = await createRoom(ME);
    expect((await invite("not-a-room-id", ME, PARTNER)).status).toBe(404);
    expect((await invite(crypto.randomUUID(), ME, PARTNER)).status).toBe(403);
    expect(await refusal(await invite(roomId, STRANGER, PARTNER))).toEqual([
      403,
      { error: "not a member" },
    ]);
  });

  test("me lists each room at a glance: name, days, members and memo count", async () => {
    const email = "glance@example.com";
    const partner = "glance-partner@example.com";
    const { roomId } = await createRoom(email);
    expect((await admit(roomId, email, partner)).status).toBe(200);
    const a = await connect(roomId, email);
    const b = await connect(roomId, partner);
    a.send({ type: "note:add", note: memo("n1") });
    await b.next();

    const res = await post("/api/me", email, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      // who is asking, so a device can tell whose what it kept is
      email,
      rooms: [
        {
          id: roomId,
          name: "Taiwan trip",
          first: "2026-11-03",
          days: 3,
          members: [
            { kind: "person", name: "Yuki", color: YUKI.color },
            { kind: "person", name: "Ken", color: KEN.color },
            { kind: "agent", name: "Claude", color: expect.any(String) },
          ],
          memos: 1,
          owner: true,
        },
      ],
      invitations: [],
      deleted: [],
    });
    // the partner is in it but did not make it; an invitation is nobody's to delete
    expect((await me(partner)).rooms).toMatchObject([{ id: roomId, owner: false }]);
    const other = await createRoom(partner);
    expect((await invite(other.roomId, partner, email)).status).toBe(200);
    expect((await me(email)).invitations).toMatchObject([{ id: other.roomId, owner: false }]);
  });

  test("an e-mail may hold ten rooms", async () => {
    const email = "collector@example.com";
    for (let i = 0; i < 10; i++) await createRoom(email);
    expect(await refusal(await post("/api/rooms", email, { trip: TRIP, me: YUKI }))).toEqual([
      409,
      { error: "at the cap" },
    ]);
  });

  test("a room the index would not record is not left set up", async () => {
    // what the Worker does with the room it made for someone at the cap
    const roomId = crypto.randomUUID();
    const worker = server.getWorker();
    const stub = (await worker.getEnv()).ROOM.getByName(roomId);
    await stub.create(TRIP, YUKI);
    await stub.discard();
    const room = await roomStorage(roomId);
    expect(await room.exec("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([]);
  });

  test("a deleted memo is not counted at a glance", async () => {
    const email = "glance-deleted@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:add", note: memo("n2"), cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:delete", id: "n1", cid: "c3" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");
    expect((await me(email)).rooms).toMatchObject([{ id: roomId, memos: 1 }]);
  });
});
