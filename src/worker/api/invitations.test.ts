import { describe, expect, test } from "vite-plus/test";

import {
  accept,
  admit,
  connect,
  createRoom,
  indexStorage,
  invite,
  invited,
  KEN,
  me,
  post,
  refusal,
  roomStorage,
  server,
  STRANGER,
  YUKI,
  useWorker,
} from "./harness";

useWorker();

describe("invitations", () => {
  test("the owner invites an e-mail; it waits in that person's list until they answer", async () => {
    const owner = "inv-owner@example.com";
    const guest = "Inv-Guest@Example.com";
    const { roomId } = await createRoom(owner);

    expect(await invite(roomId, owner, guest)).toHaveProperty("status", 200);
    expect(await invited(roomId, owner)).toEqual(["inv-guest@example.com"]);
    const { rooms, invitations } = await me("inv-guest@example.com");
    expect(rooms).toEqual([]);
    expect(invitations).toMatchObject([
      { id: roomId, name: "Taiwan trip", members: [{ name: "Yuki" }, { name: "Claude" }] },
    ]);
    // invited is not in: nothing of the room opens yet
    expect((await post(`/api/rooms/${roomId}/invited`, guest)).status).toBe(403);
  });

  test("accepting makes them a member as they say, tells the sockets, and the seat is theirs", async () => {
    const owner = "acc-owner@example.com";
    const guest = "acc-guest@example.com";
    const { roomId } = await createRoom(owner);
    const a = await connect(roomId, owner);
    expect((await invite(roomId, owner, guest)).status).toBe(200);

    expect((await accept(roomId, guest, { name: "Ken", color: "black" })).status).toBe(400);
    const res = await accept(roomId, guest, KEN);
    expect(res.status).toBe(200);
    const { memberId } = (await res.json()) as { memberId: string };

    expect(await a.next()).toEqual({
      type: "members",
      members: [
        {
          id: a.snapshot.type === "snapshot" ? a.snapshot.me : "",
          kind: "person",
          role: "owner",
          ...YUKI,
        },
        { id: "agent:claude", kind: "agent", name: "Claude", color: "#d97757" },
        { id: memberId, kind: "person", role: "guest", ...KEN },
      ],
    });
    const b = await connect(roomId, guest);
    expect(b.snapshot).toMatchObject({ me: memberId });
    expect((await me(guest)).invitations).toEqual([]);
    expect(await invited(roomId, owner)).toEqual([]);
    // the invitation was used up: accepting again (its answer lost) answers the same member
    const again = await accept(roomId, guest);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ memberId });
    a.ws.close(1000, "done");
    b.ws.close(1000, "done");
  });

  test("only the owner invites; a room holds two people, an invitation holding a seat", async () => {
    const owner = "seat-owner@example.com";
    const { roomId } = await createRoom(owner);

    expect((await invite(roomId, STRANGER, "x@example.com")).status).toBe(403);
    expect((await invite(roomId, owner, "")).status).toBe(400);
    expect((await invite(roomId, owner, "not an e-mail")).status).toBe(400);
    expect(await refusal(await invite(roomId, owner, owner))).toEqual([
      409,
      { error: "already in" },
    ]);

    expect((await invite(roomId, owner, "seat-a@example.com")).status).toBe(200);
    // already invited, to the last seat, which is theirs: a double tap, or an answer lost, is
    // answered as the invitation it made
    const again = await invite(roomId, owner, "seat-a@example.com");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ invited: "seat-a@example.com" });
    expect(await invited(roomId, owner)).toEqual(["seat-a@example.com"]);
    // the seat is held
    expect(await refusal(await invite(roomId, owner, "seat-b@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);

    expect((await accept(roomId, "seat-a@example.com")).status).toBe(200);
    expect(await refusal(await invite(roomId, "seat-a@example.com", "seat-b@example.com"))).toEqual(
      [403, { error: "not the owner" }],
    );
    // full
    expect(await refusal(await invite(roomId, owner, "seat-b@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);
    // the partner does not see whom the owner invites
    expect((await post(`/api/rooms/${roomId}/invited`, "seat-a@example.com")).status).toBe(403);
  });

  test("an invitation's path that names no room is not found", async () => {
    const email = "nopath@example.com";
    expect((await post("/api/invitations/not-a-room/decline", email)).status).toBe(404);
    expect((await accept("not-a-room", email)).status).toBe(404);
  });

  test("declining or withdrawing gives the seat back", async () => {
    const owner = "back-owner@example.com";
    const { roomId } = await createRoom(owner);

    expect((await invite(roomId, owner, "back-a@example.com")).status).toBe(200);
    expect((await post(`/api/invitations/${roomId}/decline`, "back-a@example.com")).status).toBe(
      200,
    );
    expect((await me("back-a@example.com")).invitations).toEqual([]);
    expect((await accept(roomId, "back-a@example.com")).status).toBe(404);

    expect((await invite(roomId, owner, "back-b@example.com")).status).toBe(200);
    const uninvite = (email: string, by = owner) =>
      post(`/api/rooms/${roomId}/uninvite`, by, { email });
    expect((await uninvite("nobody@example.com")).status).toBe(404);
    expect((await uninvite("back-b@example.com")).status).toBe(200);
    expect((await accept(roomId, "back-b@example.com")).status).toBe(404);

    expect((await admit(roomId, owner, "back-c@example.com")).status).toBe(200);
  });

  test("an invitee at their room cap loses the seat instead of going over", async () => {
    const owner = "cap-owner@example.com";
    const busy = "cap-busy@example.com";
    const { roomId } = await createRoom(owner);
    for (let i = 0; i < 10; i++) await createRoom(busy);
    expect((await invite(roomId, owner, busy)).status).toBe(200);
    expect(await refusal(await accept(roomId, busy))).toEqual([409, { error: "at the cap" }]);
    expect(await invited(roomId, owner)).toEqual([]);
    expect((await admit(roomId, owner, "cap-other@example.com")).status).toBe(200);
  });

  test("an acceptance the index did not record is finished by accepting again, as the same member", async () => {
    const owner = "acc-again-owner@example.com";
    const guest = "acc-again-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    // the room lets them in, and the index's call fails: the Worker never records them
    const env = await server.getWorker().getEnv();
    const seat = await env.ROOMS.getByName("index").invitation(guest, roomId);
    const ken: unknown = await env.ROOM.getByName(roomId).accept(seat, KEN);
    expect(ken).toMatchObject({ ok: true, value: expect.any(String) });
    expect((await me(guest)).rooms).toEqual([]);

    const again = await accept(roomId, guest);
    expect(again.status).toBe(200);
    const { memberId } = (await again.json()) as { memberId: string };
    expect({ ok: true, value: memberId }).toEqual(ken);
    expect(await me(guest)).toMatchObject({ rooms: [{ id: roomId }], invitations: [] });
    // one seat taken, not two: the room is full
    expect(await refusal(await invite(roomId, owner, "acc-again-third@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);
    // recorded now, accepting again answers the same member
    expect(await (await accept(roomId, guest)).json()).toEqual({ memberId });
  });

  test("an invitation the room never held a seat for is finished by inviting again", async () => {
    const owner = "inv-again-owner@example.com";
    const guest = "inv-again-guest@example.com";
    const { roomId } = await createRoom(owner);
    const env = await server.getWorker().getEnv();
    // the index records it, and the room's call fails: no seat is held for it
    const seat = crypto.randomUUID();
    expect(await env.ROOMS.getByName("index").invite(guest, roomId, seat)).toEqual({
      ok: true,
      value: seat,
    });
    const room = await roomStorage(roomId);
    expect(await room.exec("SELECT id FROM invitations")).toEqual([]);

    // asked again, the room holds the seat the index recorded, and it can be taken
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    expect(await room.exec("SELECT id FROM invitations")).toEqual([{ id: seat }]);
    expect(await invited(roomId, owner)).toEqual([guest]);
    expect((await accept(roomId, guest)).status).toBe(200);
  });

  test("a seat the room held that the index lost is given back, and the owner can invite again", async () => {
    const owner = "lost-seat-owner@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const env = await server.getWorker().getEnv();
    // a seat held by a try from before the index was asked first, whose index call failed
    const lost = crypto.randomUUID();
    expect(
      await env.ROOM.getByName(roomId).openSeat(yuki, lost, { seats: [], members: [] }),
    ).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await invited(roomId, owner)).toEqual([]);
    // just held, it may be an invitation still on its way to the index: kept for now
    expect(await refusal(await invite(roomId, owner, "lost-seat-a@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);
    // and nothing is left waiting in anyone's list for the seat that was not there
    expect((await me("lost-seat-a@example.com")).invitations).toEqual([]);

    // a minute on, it is given back
    const room = await roomStorage(roomId);
    await room.exec("UPDATE invitations SET created_at = '2000-01-01T00:00:00.000Z'");
    expect((await invite(roomId, owner, "lost-seat-a@example.com")).status).toBe(200);
    expect(await room.exec("SELECT id FROM invitations WHERE id = ?", lost)).toEqual([]);
    expect((await accept(roomId, "lost-seat-a@example.com")).status).toBe(200);
  });

  test("a decline or a withdrawal that failed part way leaves a seat the room gives back a minute on", async () => {
    const owner = "decl-again-owner@example.com";
    const guest = "decl-again-guest@example.com";
    const { roomId } = await createRoom(owner);
    const env = await server.getWorker().getEnv();
    const seatOf = () => env.ROOMS.getByName("index").invitation(guest, roomId);

    const room = await roomStorage(roomId);
    /** A minute on: a held seat the index does not list is given back at the next invitation */
    const aMinuteOn = () =>
      room.exec("UPDATE invitations SET created_at = '2000-01-01T00:00:00.000Z'");

    // the index takes the invitation, and the room's call fails: nothing is left to decline,
    // and the seat the room still holds comes back a minute on
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    const declined = await seatOf();
    expect(await env.ROOMS.getByName("index").take(guest, roomId)).toBe(declined);
    expect((await me(guest)).invitations).toEqual([]);
    expect((await post(`/api/invitations/${roomId}/decline`, guest)).status).toBe(404);
    await aMinuteOn();

    // the same for the owner taking it back
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    const seat = await seatOf();
    expect(await env.ROOMS.getByName("index").take(guest, roomId)).toBe(seat);
    expect((await post(`/api/rooms/${roomId}/uninvite`, owner, { email: guest })).status).toBe(404);
    expect(await invited(roomId, owner)).toEqual([]);
    await aMinuteOn();
    // and the seat is free
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    expect(await room.exec("SELECT id FROM invitations WHERE id = ?", seat)).toEqual([]);
  });

  test("declining after an acceptance the index did not record takes them out of the room", async () => {
    const owner = "decl-half-owner@example.com";
    const guest = "decl-half-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    const env = await server.getWorker().getEnv();
    const seat = await env.ROOMS.getByName("index").invitation(guest, roomId);
    // the room lets them in, and the index's call fails
    const stub = env.ROOM.getByName(roomId);
    expect(await stub.accept(seat, KEN)).toMatchObject({ ok: true });

    // they decline instead: not in the room, not in the index, and the seat is free
    expect((await post(`/api/invitations/${roomId}/decline`, guest)).status).toBe(200);
    expect(await me(guest)).toMatchObject({ rooms: [], invitations: [] });
    const a = await connect(roomId, owner);
    expect(a.snapshot).toMatchObject({ members: [{ role: "owner" }, { kind: "agent" }] });
    expect(a.snapshot.type === "snapshot" ? a.snapshot.members : []).toHaveLength(2);
    a.ws.close(1000, "done");
    expect((await admit(roomId, owner, "decl-half-other@example.com")).status).toBe(200);
  });

  test("a decline that failed after an acceptance the index did not record leaves nobody in the room a minute on", async () => {
    const owner = "decl-phantom-owner@example.com";
    const guest = "decl-phantom-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    const worker = server.getWorker();
    const env = await worker.getEnv();
    const index = env.ROOMS.getByName("index");
    const seat = await index.invitation(guest, roomId);
    // the room lets them in, and the index's call fails
    const stub = env.ROOM.getByName(roomId);
    expect(await stub.accept(seat, KEN)).toMatchObject({ ok: true });
    // they decline: the index takes the invitation, and the room's call fails
    expect(await index.take(guest, roomId)).toBe(seat);
    const room = await roomStorage(roomId);
    const people = () => room.exec("SELECT name FROM members WHERE kind = 'person' ORDER BY name");
    expect(await people()).toEqual([{ name: "Ken" }, { name: "Yuki" }]);
    expect(await me(guest)).toMatchObject({ rooms: [], invitations: [] });

    // a minute on, the next invitation takes the person the index never recorded out with the seat
    await room.exec("UPDATE invitations SET created_at = '2000-01-01T00:00:00.000Z'");
    expect((await invite(roomId, owner, "decl-phantom-other@example.com")).status).toBe(200);
    expect(await people()).toEqual([{ name: "Yuki" }]);
    expect((await accept(roomId, "decl-phantom-other@example.com")).status).toBe(200);
  });

  test("a seat taken by someone the index records is kept, however old", async () => {
    const owner = "seat-kept-owner@example.com";
    const guest = "seat-kept-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    const room = await roomStorage(roomId);
    await room.exec("UPDATE invitations SET created_at = '2000-01-01T00:00:00.000Z'");
    expect(await refusal(await invite(roomId, owner, "seat-kept-other@example.com"))).toEqual([
      409,
      { error: "no seat" },
    ]);
    expect((await me(guest)).rooms).toMatchObject([{ id: roomId }]);
  });

  test("an invitation inviting it again, a double tap, stands as it was", async () => {
    const owner = "double-owner@example.com";
    const guest = "double-guest@example.com";
    const { roomId } = await createRoom(owner);
    const [one, two] = await Promise.all([
      invite(roomId, owner, guest),
      invite(roomId, owner, guest),
    ]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(await two.json()).toEqual({ invited: guest });
    expect(await invited(roomId, owner)).toEqual([guest]);
    const room = await roomStorage(roomId);
    expect(await room.exec("SELECT COUNT(*) AS n FROM invitations")).toEqual([{ n: 1 }]);
    expect((await accept(roomId, guest)).status).toBe(200);
  });

  /**
   * An acceptance's steps run by hand, so a test can put another call between them: the room
   * lets them in on the seat the index has for them, then the index records them
   */
  async function acceptBySteps(roomId: string, guest: string) {
    const env = await server.getWorker().getEnv();
    const index = env.ROOMS.getByName("index");
    const seat = await index.invitation(guest, roomId);
    const room = env.ROOM.getByName(roomId);
    const entered = (await room.accept(seat, KEN)) as { ok: boolean; value: string };
    expect(entered).toMatchObject({ ok: true });
    return { index, room, seat, memberId: entered.value };
  }

  test("a withdrawal between the room letting them in and the index recording them wins", async () => {
    const owner = "race-uninvite-owner@example.com";
    const guest = "race-uninvite-guest@example.com";
    const { roomId } = await createRoom(owner);
    const uninvite = () => post(`/api/rooms/${roomId}/uninvite`, owner, { email: guest });

    // the whole withdrawal comes between: the room takes them out with the seat
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    let step = await acceptBySteps(roomId, guest);
    expect((await uninvite()).status).toBe(200);
    expect(await step.index.join(guest, roomId, step.memberId, step.seat)).toEqual({
      ok: false,
      reason: "not invited",
    });
    expect(await me(guest)).toMatchObject({ rooms: [], invitations: [] });

    // only its first step comes between: the index refuses them, and the acceptance takes them
    // out of the room itself (as the route does) before the withdrawal gives the seat back
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    step = await acceptBySteps(roomId, guest);
    const env = await server.getWorker().getEnv();
    expect(await env.ROOMS.getByName("index").take(guest, roomId)).toBe(step.seat);
    expect(await step.index.join(guest, roomId, step.memberId, step.seat)).toMatchObject({
      ok: false,
    });
    await step.room.unaccept(step.memberId);
    await step.room.closeSeat(step.seat);
    expect(await me(guest)).toMatchObject({ rooms: [], invitations: [] });

    // either way nobody is left in the room, and its seat is free
    const a = await connect(roomId, owner);
    expect(a.snapshot.type === "snapshot" ? a.snapshot.members : []).toHaveLength(2);
    a.ws.close(1000, "done");
    expect((await admit(roomId, owner, "race-uninvite-other@example.com")).status).toBe(200);
  });

  test("an acceptance the index recorded first stands; the withdrawal after it finds nothing", async () => {
    const owner = "race-accepted-owner@example.com";
    const guest = "race-accepted-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    const step = await acceptBySteps(roomId, guest);
    expect(await step.index.join(guest, roomId, step.memberId, step.seat)).toEqual({
      ok: true,
    });
    expect((await post(`/api/rooms/${roomId}/uninvite`, owner, { email: guest })).status).toBe(404);
    expect((await post(`/api/invitations/${roomId}/decline`, guest)).status).toBe(404);
    // in, as the room and the index both say
    expect(await me(guest)).toMatchObject({ rooms: [{ id: roomId }], invitations: [] });
    expect((await post(`/api/rooms/${roomId}/candidates`, guest)).status).toBe(200);
  });

  test("an acceptance the owner's deletion overtook is not listed, live or deleted", async () => {
    const owner = "race-delete-owner@example.com";
    const guest = "race-delete-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await invite(roomId, owner, guest)).status).toBe(200);
    const step = await acceptBySteps(roomId, guest);
    // the whole deletion comes between: the index marks the room and drops its invitations
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    expect(await step.index.join(guest, roomId, step.memberId, step.seat)).toEqual({
      ok: false,
      reason: "not invited",
    });
    await step.room.unaccept(step.memberId);
    expect(await me(guest)).toMatchObject({ rooms: [], invitations: [], deleted: [] });
    const index = await indexStorage();
    expect(await index.exec("SELECT 1 FROM memberships WHERE email = ?", guest)).toEqual([]);
    // the owner restores it: it is theirs alone, with its seat free
    expect((await post(`/api/rooms/${roomId}/restore`, owner)).status).toBe(200);
    const a = await connect(roomId, owner);
    expect(a.snapshot.type === "snapshot" ? a.snapshot.members : []).toHaveLength(2);
    a.ws.close(1000, "done");
    expect((await admit(roomId, owner, "race-delete-other@example.com")).status).toBe(200);
  });
});
