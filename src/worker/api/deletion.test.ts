import { describe, expect, test } from "vite-plus/test";

import {
  accept,
  admit,
  APP,
  asked,
  connect,
  createRoom,
  indexStorage,
  invite,
  me,
  now,
  PNG,
  post,
  refusal,
  roomStorage,
  server,
  STRANGER,
  token,
  upgrade,
  useWorker,
} from "./harness";

useWorker();

describe("deleting a room", () => {
  test("only the owner deletes; every socket is told, nobody can open it, either person can restore it", async () => {
    const owner = "del-owner@example.com";
    const guest = "del-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    const a = await connect(roomId, owner);
    const b = await connect(roomId, guest);

    expect((await post(`/api/rooms/${roomId}/delete`, guest)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    expect(await a.next()).toEqual({ type: "gone", reason: "deleted" });
    expect(await b.next()).toEqual({ type: "gone", reason: "deleted" });

    const listed = me;
    for (const email of [owner, guest])
      expect(await listed(email)).toMatchObject({
        rooms: [],
        deleted: [{ id: roomId, name: "Taiwan trip", deletedAt: expect.any(String) }],
      });
    expect((await listed(STRANGER)).deleted).toEqual([]);
    expect((await post(`/api/rooms/${roomId}/invited`, owner)).status).toBe(403);
    expect((await upgrade(roomId, owner)).status).toBe(403);

    expect((await post(`/api/rooms/${roomId}/restore`, STRANGER)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/restore`, guest)).status).toBe(200);
    expect((await listed(owner)).rooms).toMatchObject([{ id: roomId }]);
    // the other one brought it back first: a deleted room has nobody in it now
    expect(await refusal(await post(`/api/rooms/${roomId}/restore`, owner))).toEqual([
      403,
      { error: "not a member" },
    ]);
    const c = await connect(roomId, owner);
    c.ws.close(1000, "done");
  });

  test("the owner, and only the owner, has a deleted room gone for good at once", async () => {
    const owner = "purge-owner@example.com";
    const guest = "purge-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    expect((await post(`/api/rooms/${roomId}/purge`, owner)).status).toBe(403); // not deleted
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);

    expect((await post(`/api/rooms/${roomId}/purge`, STRANGER)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/purge`, guest)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/purge`, owner)).status).toBe(200);

    for (const email of [owner, guest])
      expect(await me(email)).toMatchObject({ rooms: [], deleted: [] });
    expect((await post(`/api/rooms/${roomId}/restore`, guest)).status).toBe(403);
    const room = await roomStorage(roomId);
    expect(
      await room.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trip'"),
    ).toEqual([]);
    const index = await indexStorage();
    expect(await index.exec("SELECT * FROM memberships WHERE room_id = ?", roomId)).toEqual([]);
  });

  test("an agent call that answers after its asker left, or after the room went for good, writes nothing", async () => {
    const owner = "late-owner@example.com";
    const guest = "late-guest@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const { memberId: ken } = (await (await admit(roomId, owner, guest)).json()) as {
      memberId: string;
    };
    const worker = server.getWorker();
    const stub = (await worker.getEnv()).ROOM.getByName(roomId);
    const room = await roomStorage(roomId);
    const tokens = { input: 10, output: 5 };
    // a room has its ledger from the start, before any call
    expect(await room.exec("SELECT * FROM agent_calls")).toEqual([]);

    // asked by the partner, who has left by the time Claude answers
    expect((await post(`/api/rooms/${roomId}/leave`, guest)).status).toBe(200);
    await stub.recordAgentCall(ken, "draft", tokens);
    expect(await room.exec("SELECT * FROM agent_calls")).toEqual([]);

    // asked by the owner, who deletes the room and has it gone before Claude answers
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    await stub.recordAgentCall(yuki, "draft", tokens);
    expect(await room.exec("SELECT * FROM agent_calls")).toEqual([]);
    expect((await post(`/api/rooms/${roomId}/purge`, owner)).status).toBe(200);
    // the room is gone: whatever the late call answers, it leaves no table behind
    await stub.recordAgentCall(yuki, "draft", tokens).catch(() => undefined);
    expect(await room.exec("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([]);
  });

  test("deleting right after a removal passes over the socket still closing; asked again, it finishes", async () => {
    const owner = "delrm-owner@example.com";
    const guest = "delrm-guest@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const { memberId: ken } = (await (await admit(roomId, owner, guest)).json()) as {
      memberId: string;
    };
    const b = await connect(roomId, guest);
    const stub = (await server.getWorker().getEnv()).ROOM.getByName(roomId);
    // one after the other, before the removed phone has answered the close
    await Promise.all([stub.remove(yuki, ken), stub.delete(yuki, roomId, now())]);
    expect(await b.next()).toEqual({ type: "gone", reason: "removed" });
    const at = await stub.deletedAt();
    expect(at).not.toBeNull();

    // the index was never told (a build that told the room first, its index call failed): the
    // list of trips leaves the deleted room out, the owner asks again, and the deletion keeps its
    // time
    expect(await me(owner)).toMatchObject({ rooms: [], deleted: [] });
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    expect(await me(owner)).toMatchObject({ rooms: [], deleted: [{ id: roomId, deletedAt: at }] });
  });

  test("a restore the index did not hear of is finished by restoring again", async () => {
    const owner = "res-again-owner@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    // the room takes the deletion back, and the index's call fails: the index still hides it
    expect(await (await server.getWorker().getEnv()).ROOM.getByName(roomId).restore(yuki)).toEqual({
      ok: true,
      value: undefined,
    });
    // still listed among the deleted trips, as the index has it, so it can be restored
    expect(await me(owner)).toMatchObject({ rooms: [], deleted: [{ id: roomId }] });

    // asked again, the room says it is not deleted, and the index shows it: the restore is done
    expect((await post(`/api/rooms/${roomId}/restore`, owner)).status).toBe(200);
    expect(await me(owner)).toMatchObject({ rooms: [{ id: roomId }], deleted: [] });
    const c = await connect(roomId, owner);
    c.ws.close(1000, "done");
  });

  test("a deleted room writes nothing for anyone, whatever the index still says", async () => {
    const owner = "del-writes-owner@example.com";
    const { roomId, memberId: yuki } = await createRoom(owner);
    const stub = (await server.getWorker().getEnv()).ROOM.getByName(roomId);
    // deleted in the room, the index not told yet
    const at = now();
    expect((await stub.delete(yuki, roomId, at)).ok).toBe(true);
    const calls = asked.length;
    // the index still lets the owner in; the room refuses every call that would write or read
    const answers = [
      await invite(roomId, owner, "del-writes-guest@example.com"),
      await post(`/api/rooms/${roomId}/publish`, owner, { lang: "en" }),
      await post(`/api/rooms/${roomId}/tags`, owner, { title: "x", body: "", image: null }),
      await post(`/api/rooms/${roomId}/candidates`, owner),
      await post(`/api/rooms/${roomId}/suggest`, owner, { at: { x: 0, y: 0 } }),
      await server.fetch(`${APP}/api/rooms/${roomId}/images`, {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          Origin: APP,
          "Cf-Access-Jwt-Assertion": await token(owner),
        },
        body: PNG,
      }),
    ];
    // each refused as the refusal of someone not in the room, which the app's client reads
    for (const res of answers) expect(await refusal(res)).toEqual([403, { error: "not a member" }]);
    expect(asked.length).toBe(calls);
    const room = await roomStorage(roomId);
    expect(await room.exec("SELECT id FROM invitations UNION ALL SELECT id FROM pictures")).toEqual(
      [],
    );
    expect(await room.exec("SELECT id FROM publication")).toEqual([]);
    // what restoring reads is still answered; the list of trips leaves it out
    expect(await stub.deletedFor(yuki, now())).toEqual({ name: "Taiwan trip", deletedAt: at });
    expect(await stub.summary(yuki)).toBeNull();
    expect((await me(owner)).rooms).toEqual([]);
  });

  test("a deletion the room did not hear of lists the trip as deleted, and restoring brings it back", async () => {
    const owner = "del-half-owner@example.com";
    const guest = "del-half-guest@example.com";
    const { roomId } = await createRoom(owner);
    expect((await admit(roomId, owner, guest)).status).toBe(200);
    // the index hides the room first, and the room's call fails
    const at = now();
    await (await server.getWorker().getEnv()).ROOMS.getByName("index").mark(roomId, at);

    // nobody is let in, and both see it among their deleted trips, as the index has it
    expect(await refusal(await post(`/api/rooms/${roomId}/candidates`, owner))).toEqual([
      403,
      { error: "not a member" },
    ]);
    for (const email of [owner, guest])
      expect(await me(email)).toMatchObject({
        rooms: [],
        deleted: [{ id: roomId, name: "Taiwan trip", deletedAt: at }],
      });
    // restoring brings it back to both
    expect((await post(`/api/rooms/${roomId}/restore`, guest)).status).toBe(200);
    for (const email of [owner, guest])
      expect(await me(email)).toMatchObject({ rooms: [{ id: roomId }], deleted: [] });
  });

  test("a deleted room takes its invitations with it", async () => {
    const owner = "deli-owner@example.com";
    const { roomId } = await createRoom(owner);
    expect((await invite(roomId, owner, "deli-guest@example.com")).status).toBe(200);
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);
    expect((await me("deli-guest@example.com")).invitations).toEqual([]);
    expect((await accept(roomId, "deli-guest@example.com")).status).toBe(404);
  });

  test("on its day the room, its pictures and its memberships go for good", async () => {
    const owner = "gone-owner@example.com";
    const { roomId } = await createRoom(owner);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const up = await server.fetch(`${APP}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        Origin: APP,
        "Cf-Access-Jwt-Assertion": await token(owner),
      },
      body: png,
    });
    expect(up.status).toBe(200);
    const { id: imageId } = (await up.json()) as { id: string };
    expect((await post(`/api/rooms/${roomId}/delete`, owner)).status).toBe(200);

    const worker = server.getWorker();
    const room = await roomStorage(roomId);
    const env = await worker.getEnv();
    const stub = env.ROOM.getByName(roomId);
    // before its day the alarm leaves everything
    await stub.sweep();
    expect(await env.IMAGES.head(`rooms/${roomId}/images/${imageId}`)).not.toBeNull();

    // the day comes early
    await room.exec("UPDATE deletion SET at = '2000-01-01T00:00:00.000Z'");
    await stub.sweep();
    expect(
      await room.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trip'"),
    ).toEqual([]);
    const index = await indexStorage();
    expect(await index.exec("SELECT * FROM memberships WHERE room_id = ?", roomId)).toEqual([]);
    expect(await env.IMAGES.head(`rooms/${roomId}/images/${imageId}`)).toBeNull();
  });
});
