import { describe, expect, test } from "vite-plus/test";

import {
  accept,
  admit,
  asked,
  budgetLeft,
  connect,
  createRoom,
  fetched,
  followed,
  indexStorage,
  invite,
  looked,
  me,
  memo,
  PER_DAY,
  post,
  refusal,
  roomStorage,
  server,
  upgrade,
  useWorker,
} from "./harness";

useWorker();

describe("removing and leaving", () => {
  test("the owner removes the partner: their socket is told and closed, the room goes from their list", async () => {
    const owner = "rm-owner@example.com";
    const guest = "rm-guest@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const { memberId: ken } = (await (await admit(roomId, owner, guest)).json()) as {
      memberId: string;
    };
    const a = await connect(roomId, owner);
    const b = await connect(roomId, guest);
    b.send({ type: "note:add", note: memo("kept") });
    await a.next();

    const remove = (by: string, member: string) =>
      post(`/api/rooms/${roomId}/remove`, by, { member });
    // nobody removes the owner
    expect(await refusal(await remove(guest, yuki))).toEqual([403, { error: "the owner" }]);
    expect((await remove(owner, yuki)).status).toBe(403);
    // the agent is no person in the room to take out: nothing changes (it is still there below)
    expect((await remove(owner, "agent:claude")).status).toBe(200);
    expect((await remove(owner, "yuki")).status).toBe(400); // not a member id at all
    expect((await remove(owner, ken)).status).toBe(200);

    expect(await b.next()).toEqual({ type: "gone", reason: "removed" });
    expect(await a.next()).toMatchObject({
      type: "members",
      members: [{ id: yuki }, { id: "agent:claude" }],
    });
    expect((await post("/api/me", guest)).status).toBe(200);
    expect((await me(guest)).rooms).toEqual([]);
    expect((await post(`/api/rooms/${roomId}/invited`, guest)).status).toBe(403);
    // what they wrote stays, in their name
    const c = await connect(roomId, owner);
    expect(c.snapshot).toMatchObject({ notes: [{ id: "kept", by: ken }] });
    // and the seat is free again
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    a.ws.close(1000, "done");
    c.ws.close(1000, "done");
  });

  test("the partner may leave; the owner may not", async () => {
    const owner = "lv-owner@example.com";
    const guest = "lv-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    const b = await connect(roomId, guest);
    expect(await refusal(await post(`/api/rooms/${roomId}/leave`, owner))).toEqual([
      403,
      { error: "the owner" },
    ]);
    expect((await post(`/api/rooms/${roomId}/leave`, guest)).status).toBe(200);
    expect(await b.next()).toEqual({ type: "gone", reason: "left" });
    expect((await me(guest)).rooms).toEqual([]);
    expect((await post(`/api/rooms/${roomId}/leave`, guest)).status).toBe(403);
  });

  test("a removal or a leave the index did not hear of is finished by asking again", async () => {
    const owner = "again-owner@example.com";
    const guest = "again-guest@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const admitted = async () =>
      ((await (await admit(roomId, owner, guest)).json()) as { memberId: string }).memberId;
    const stub = (await server.getWorker().getEnv()).ROOM.getByName(roomId);
    const index = await indexStorage();
    // what the index lists them in; the list of trips asks the room too, and leaves this out
    const indexed = () => index.exec("SELECT room_id FROM memberships WHERE email = ?", guest);

    // the room takes them out, and the index's call fails: the index still lists them
    const ken = await admitted();
    expect((await stub.remove(yuki, ken)).ok).toBe(true);
    expect(await indexed()).toEqual([{ room_id: roomId }]);
    // the index still lets them in; the room refuses them as someone not in it, as JSON
    expect(await refusal(await post(`/api/rooms/${roomId}/candidates`, guest))).toEqual([
      403,
      { error: "not a member" },
    ]);
    // the owner asks again: they are out, and the index forgets them, so the removal is done
    expect((await post(`/api/rooms/${roomId}/remove`, owner, { member: ken })).status).toBe(200);
    expect((await me(guest)).rooms).toEqual([]);

    // invited again, they leave, and the index's call fails the same way
    const again = await admitted();
    expect((await stub.remove(again, again)).ok).toBe(true);
    expect(await indexed()).toEqual([{ room_id: roomId }]);
    expect((await post(`/api/rooms/${roomId}/leave`, guest)).status).toBe(200);
    expect((await me(guest)).rooms).toEqual([]);
    expect((await invite(roomId, owner, guest)).status).toBe(200);
  });

  test("the index forgets them first: should the room's step fail, they are let in nowhere and the seat comes back", async () => {
    const owner = "rm-half-owner@example.com";
    const guest = "rm-half-guest@example.com";
    const { roomId } = await createRoom(owner);
    const worker = server.getWorker();
    const index = (await worker.getEnv()).ROOMS.getByName("index");
    const room = await roomStorage(roomId);
    const members = () => room.exec("SELECT name FROM members WHERE kind = 'person' ORDER BY name");
    const aMinuteOn = () =>
      room.exec("UPDATE invitations SET created_at = '2000-01-01T00:00:00.000Z'");

    const { memberId: ken } = (await (await admit(roomId, owner, guest)).json()) as {
      memberId: string;
    };
    // the index forgets them (a removal's or a leave's first step), and the room's call fails
    await index.forget(roomId, ken);
    expect(await members()).toEqual([{ name: "Ken" }, { name: "Yuki" }]);
    // they are in no list, and let in nowhere
    expect((await me(guest)).rooms).toEqual([]);
    expect((await upgrade(roomId, guest)).status).toBe(403);
    // just taken, their seat may be an acceptance on its way to the index: kept for now
    expect(await refusal(await invite(roomId, owner, "rm-half-other@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);
    // a minute on, the room gives it back, and they can be asked in again
    await aMinuteOn();
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    expect(await members()).toEqual([{ name: "Ken" }, { name: "Yuki" }]);
    expect((await me(guest)).rooms).toMatchObject([{ id: roomId }]);
  });

  test("a membership the index kept and the room no longer has does not stop them being invited again", async () => {
    const owner = "stale-inv-owner@example.com";
    const guest = "stale-inv-guest@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const { memberId: ken } = (await (await admit(roomId, owner, guest)).json()) as {
      memberId: string;
    };
    // the room takes them out, and the index's call fails (a build that told the room first)
    const stub = (await server.getWorker().getEnv()).ROOM.getByName(roomId);
    expect((await stub.remove(yuki, ken)).ok).toBe(true);
    // inviting them again forgets the row the room no longer honours, and they can come back
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    expect((await accept(roomId, guest)).status).toBe(200);
    expect((await me(guest)).rooms).toMatchObject([{ id: roomId }]);
    // someone who is in is still refused
    expect(await refusal(await invite(roomId, owner, guest))).toEqual([
      409,
      { error: "already in" },
    ]);
  });

  test("someone the index still lists but the room took out looks nothing up and sees no trip", async () => {
    const owner = "stale-owner@example.com";
    const guest = "stale-guest@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const { memberId: ken } = (await (await admit(roomId, owner, guest)).json()) as {
      memberId: string;
    };
    const stub = (await server.getWorker().getEnv()).ROOM.getByName(roomId);
    // the room takes them out, and the index's call fails: the index still lists them
    expect((await stub.remove(yuki, ken)).ok).toBe(true);

    const notMember = [403, { error: "not a member" }];
    expect(
      await refusal(await post(`/api/rooms/${roomId}/find`, guest, { query: "Inn", lang: "en" })),
    ).toEqual(notMember);
    expect(
      await refusal(
        await post(`/api/rooms/${roomId}/where`, guest, { lat: 25.03, lng: 121.56, lang: "en" }),
      ),
    ).toEqual(notMember);
    expect(
      await refusal(
        await post(`/api/rooms/${roomId}/expand`, guest, { url: "https://maps.app.goo.gl/x" }),
      ),
    ).toEqual(notMember);
    expect(
      await refusal(
        await post(`/api/rooms/${roomId}/preview`, guest, { url: "https://blog.example.com/post" }),
      ),
    ).toEqual(notMember);
    // nothing was asked of anyone
    expect([asked, looked, fetched, followed]).toEqual([[], [], [], []]);
    // and the list of trips leaves out the one they are no longer in
    expect((await me(guest)).rooms).toEqual([]);
    expect((await me(owner)).rooms).toMatchObject([{ id: roomId, owner: true }]);
    // nor was anything spent: in a room of their own, the whole day's budget is theirs
    const { roomId: theirs } = await createRoom(guest);
    expect(await budgetLeft(theirs, guest)).toBe(PER_DAY);
  });
});
